import { createResource, For, Show, createEffect, createMemo } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import { useBasePath } from "../context/base-path"
import { base64Encode } from "../utils/path"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Button } from "@opencode-ai/ui/button"

interface Project {
  id: string
  worktree?: string
  name?: string
  time?: { created: number; updated: number }
}

// Default directory for Kubeflow notebooks
const DEFAULT_DIRECTORY = "/home/jovyan"

export function ProjectPicker() {
  const { serverUrl } = useBasePath()
  const navigate = useNavigate()

  // Create a client without directory to fetch global data
  const client = createOpencodeClient({ baseUrl: serverUrl, throwOnError: true })

  const [currentProject] = createResource(async () => {
    try {
      const res = await client.project.current()
      return res.data as Project | undefined
    } catch {
      return undefined
    }
  })

  const [projects] = createResource(async () => {
    try {
      const res = await client.project.list()
      const data = res.data
      // Handle both array response and object with nested array
      if (Array.isArray(data)) return data as Project[]
      if (data && typeof data === "object" && "projects" in data) {
        return (data as { projects: Project[] }).projects ?? []
      }
      console.warn("[ProjectPicker] Unexpected project.list response:", data)
      return []
    } catch (err) {
      console.warn("[ProjectPicker] Failed to list projects:", err)
      return []
    }
  })

  // Filter to only valid projects (with worktree that's not "/")
  const validProjects = createMemo(() => (projects() ?? []).filter((p) => p.worktree && p.worktree !== "/"))

  // Auto-navigate once resources are loaded
  createEffect(() => {
    // Wait for both resources to finish loading
    if (projects.loading || currentProject.loading) return

    const projectList = validProjects()
    const current = currentProject()

    // If we have a current project with valid worktree, navigate to it
    if (current?.worktree && current.worktree !== "/") {
      navigate(`/${base64Encode(current.worktree)}/session`, { replace: true })
      return
    }

    // If we have valid projects, navigate to the most recently updated one
    if (projectList.length > 0) {
      const sorted = [...projectList].sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0))
      const first = sorted[0]
      if (first?.worktree) {
        navigate(`/${base64Encode(first.worktree)}/session`, { replace: true })
        return
      }
    }

    // No valid projects found - in Kubeflow context, auto-navigate to default directory
    // This will create a new project for /home/jovyan
    navigate(`/${base64Encode(DEFAULT_DIRECTORY)}/session`, { replace: true })
  })

  function selectProject(worktree: string) {
    navigate(`/${base64Encode(worktree)}/session`)
  }

  function getProjectName(project: Project): string {
    if (!project.worktree) return project.name || project.id || "Unknown"
    return project.name || project.worktree.split("/").pop() || project.worktree
  }

  return (
    <div class="min-h-screen flex items-center justify-center" style={{ background: "var(--background-stronger)" }}>
      <div
        class="w-full max-w-md p-6 rounded-lg"
        style={{
          background: "var(--background-base)",
          border: "1px solid var(--border-base)",
        }}
      >
        <h1 class="text-xl font-semibold mb-4" style={{ color: "var(--text-strong)" }}>
          Select Project
        </h1>

        <Show
          when={!projects.loading}
          fallback={
            <div class="flex items-center justify-center py-8">
              <Spinner class="w-6 h-6" style={{ color: "var(--text-interactive-base)" }} />
            </div>
          }
        >
          <Show
            when={validProjects().length}
            fallback={
              <div class="text-center py-8">
                <div class="mb-4" style={{ color: "var(--text-weak)" }}>
                  <p>No projects found.</p>
                  <p class="text-sm mt-2">Redirecting to home directory...</p>
                </div>
                <Button onClick={() => selectProject(DEFAULT_DIRECTORY)} variant="primary">
                  Open Home Directory
                </Button>
              </div>
            }
          >
            <div class="space-y-2">
              <For each={validProjects()}>
                {(project) => {
                  const isCurrent = currentProject()?.id === project.id
                  return (
                    <button
                      onClick={() => selectProject(project.worktree!)}
                      class="w-full flex items-center gap-3 p-3 rounded-md text-left transition-colors"
                      style={{
                        background: isCurrent ? "var(--surface-inset)" : "transparent",
                        border: `1px solid ${isCurrent ? "var(--border-interactive-base)" : "var(--border-base)"}`,
                      }}
                      onMouseEnter={(e) => {
                        if (!isCurrent) e.currentTarget.style.background = "var(--surface-inset)"
                      }}
                      onMouseLeave={(e) => {
                        if (!isCurrent) e.currentTarget.style.background = "transparent"
                      }}
                    >
                      <div
                        class="w-10 h-10 rounded flex items-center justify-center shrink-0"
                        style={{ background: "var(--surface-interactive-base)" }}
                      >
                        <svg
                          class="w-5 h-5"
                          style={{ color: "var(--icon-interactive-base)" }}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                          />
                        </svg>
                      </div>
                      <div class="flex-1 min-w-0">
                        <div class="font-medium truncate" style={{ color: "var(--text-strong)" }}>
                          {getProjectName(project)}
                        </div>
                        <div class="text-sm truncate" style={{ color: "var(--text-weak)" }}>
                          {project.worktree}
                        </div>
                      </div>
                      <Show when={isCurrent}>
                        <span
                          class="text-xs px-2 py-0.5 rounded"
                          style={{
                            background: "var(--surface-interactive-base)",
                            color: "var(--text-interactive-base)",
                          }}
                        >
                          current
                        </span>
                      </Show>
                    </button>
                  )
                }}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  )
}
