import { createSignal, createResource, For, Show, createMemo } from "solid-js"
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

// Prokube icon (PK logo)
function PkIcon(props: { class?: string }) {
  return (
    <svg class={props.class} viewBox="0 0 73.87881 73.87876" xmlns="http://www.w3.org/2000/svg">
      <path d="m73.87881,0H0v73.87876h73.87881V0h0Z" fill="#08000e" />
      <rect x="61.72833" y="27.10204" width="5.55266" height="5.55266" fill="#fff" />
      <path
        d="m6.59779,67.28097v-34.21636h19.11633c1.07361,0,2.05576.26894,2.94586.80538.89015.53706,1.59612,1.24374,2.11935,2.11935.52256.87621.78415,1.85102.78415,2.92463v12.88551c0,1.07422-.26159,2.04913-.78415,2.92473-.52323.87621-1.2292,1.5828-2.11935,2.11924-.8901.53706-1.87225.80528-2.94586.80528h-13.56367v9.63224h-5.55266Zm6.06129-15.18479h12.8431c.1411,0,.26098-.04899.36028-.1483.0987-.0987.14835-.21862.14835-.36028v-12.46164c0-.14115-.04965-.26098-.14835-.36028-.09931-.0987-.21918-.1484-.36028-.1484h-12.8431c-.14177,0-.26164.0497-.36028.1484-.09936.09931-.14835.21913-.14835.36028v12.46164c0,.14166.04899.26159.14835.36028.09864.09931.21852.1483.36028.1483Z"
        fill="#fff"
      />
      <path
        d="m34.55118,57.64873V23.43238h5.55266v19.12689h4.36581l8.77398-9.49465h5.93412v1.52595l-9.7913,10.76616,9.74894,10.76616v1.52585h-5.89176l-8.77398-9.49445h-4.36581v9.49445h-5.55266Z"
        fill="#fff"
      />
    </svg>
  )
}

// Default directory for Kubeflow notebooks
const DEFAULT_DIRECTORY = "/home/jovyan"

export function ProjectPicker() {
  const { serverUrl } = useBasePath()
  const navigate = useNavigate()

  const [showFolderInput, setShowFolderInput] = createSignal(false)
  const [folderPath, setFolderPath] = createSignal("")
  const [folderSearch, setFolderSearch] = createSignal("")
  const [searchResults, setSearchResults] = createSignal<string[]>([])
  const [searching, setSearching] = createSignal(false)
  const [showCreateFolder, setShowCreateFolder] = createSignal(false)
  const [newFolderName, setNewFolderName] = createSignal("")

  // Create a client without directory to fetch global data
  const client = createOpencodeClient({ baseUrl: serverUrl, throwOnError: false })

  const [projects, { refetch: refetchProjects }] = createResource(async () => {
    try {
      const res = await client.project.list()
      const data = res.data
      if (Array.isArray(data)) return data as Project[]
      if (data && typeof data === "object" && "projects" in data) {
        return (data as { projects: Project[] }).projects ?? []
      }
      return []
    } catch {
      return []
    }
  })

  // Filter to only valid projects (with worktree that's not "/")
  const validProjects = createMemo(() =>
    (projects() ?? [])
      .filter((p) => p.worktree && p.worktree !== "/")
      .sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0)),
  )

  function selectProject(worktree: string) {
    navigate(`/${base64Encode(worktree)}/session`)
  }

  function getProjectName(project: Project): string {
    if (!project.worktree) return project.name || project.id || "Unknown"
    return project.name || project.worktree.split("/").pop() || project.worktree
  }

  // Search for folders
  async function searchFolders(query: string) {
    if (!query.trim()) {
      setSearchResults([])
      return
    }

    setSearching(true)
    try {
      const res = await client.find.files({
        directory: DEFAULT_DIRECTORY,
        query: query,
        type: "directory",
        limit: 20,
      })
      const results = res.data ?? []
      // Prepend base directory to results
      setSearchResults(results.map((r) => `${DEFAULT_DIRECTORY}/${r}`.replace(/\/+/g, "/")))
    } catch (e) {
      console.error("Failed to search folders:", e)
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  // Create a new folder - just navigate to it
  // OpenCode will work with the path, and the folder can be created on first use
  function createFolder() {
    const name = newFolderName().trim()
    if (!name) return

    const fullPath = `${DEFAULT_DIRECTORY}/${name}`.replace(/\/+/g, "/")
    selectProject(fullPath)
  }

  // Open a specific folder path
  function openFolderPath() {
    const path = folderPath().trim()
    if (path) {
      selectProject(path)
    }
  }

  return (
    <div class="min-h-screen flex flex-col" style={{ background: "var(--background-stronger)" }}>
      {/* Header */}
      <header
        class="flex items-center gap-4 p-4"
        style={{ background: "var(--background-base)", "border-bottom": "1px solid var(--border-base)" }}
      >
        <PkIcon class="w-8 h-8 rounded" />
        <h1 class="text-lg font-semibold" style={{ color: "var(--text-strong)" }}>
          prokube.ai
        </h1>
      </header>

      {/* Main content */}
      <main class="flex-1 flex items-center justify-center p-6">
        <div class="w-full max-w-xl">
          {/* Title */}
          <div class="text-center mb-8">
            <h2 class="text-2xl font-semibold mb-2" style={{ color: "var(--text-strong)" }}>
              Select a Project
            </h2>
            <p style={{ color: "var(--text-weak)" }}>Choose a folder to start working with OpenCode</p>
          </div>

          {/* Action buttons */}
          <div class="flex gap-3 mb-6">
            <Button onClick={() => setShowFolderInput(!showFolderInput())} variant="secondary" class="flex-1">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
              Open Folder
            </Button>
            <Button onClick={() => setShowCreateFolder(!showCreateFolder())} variant="secondary" class="flex-1">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              Create Folder
            </Button>
          </div>

          {/* Open folder input */}
          <Show when={showFolderInput()}>
            <div
              class="mb-6 p-4 rounded-lg"
              style={{ background: "var(--background-base)", border: "1px solid var(--border-base)" }}
            >
              <label class="block text-sm font-medium mb-2" style={{ color: "var(--text-strong)" }}>
                Search for a folder
              </label>
              <div class="flex gap-2 mb-3">
                <input
                  type="text"
                  value={folderSearch()}
                  onInput={(e) => {
                    setFolderSearch(e.currentTarget.value)
                    searchFolders(e.currentTarget.value)
                  }}
                  placeholder="Type to search..."
                  class="flex-1 px-3 py-2 rounded-md text-sm"
                  style={{
                    background: "var(--background-stronger)",
                    border: "1px solid var(--border-base)",
                    color: "var(--text-base)",
                  }}
                />
              </div>

              {/* Search results */}
              <Show when={searching()}>
                <div class="flex items-center justify-center py-4">
                  <Spinner class="w-5 h-5" style={{ color: "var(--text-interactive-base)" }} />
                </div>
              </Show>

              <Show when={!searching() && searchResults().length > 0}>
                <div class="space-y-1 max-h-48 overflow-y-auto">
                  <For each={searchResults()}>
                    {(path) => (
                      <button
                        onClick={() => selectProject(path)}
                        class="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors"
                        style={{ color: "var(--text-base)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-inset)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <svg
                          class="w-4 h-4 shrink-0"
                          style={{ color: "var(--icon-weak)" }}
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
                        <span class="truncate">{path}</span>
                      </button>
                    )}
                  </For>
                </div>
              </Show>

              {/* Direct path input */}
              <div class="mt-4 pt-4" style={{ "border-top": "1px solid var(--border-base)" }}>
                <label class="block text-sm mb-2" style={{ color: "var(--text-weak)" }}>
                  Or enter path directly:
                </label>
                <div class="flex gap-2">
                  <input
                    type="text"
                    value={folderPath()}
                    onInput={(e) => setFolderPath(e.currentTarget.value)}
                    placeholder="/home/jovyan/my-project"
                    class="flex-1 px-3 py-2 rounded-md text-sm"
                    style={{
                      background: "var(--background-stronger)",
                      border: "1px solid var(--border-base)",
                      color: "var(--text-base)",
                    }}
                    onKeyDown={(e) => e.key === "Enter" && openFolderPath()}
                  />
                  <Button onClick={openFolderPath} variant="primary" disabled={!folderPath().trim()}>
                    Open
                  </Button>
                </div>
              </div>
            </div>
          </Show>

          {/* Create folder input */}
          <Show when={showCreateFolder()}>
            <div
              class="mb-6 p-4 rounded-lg"
              style={{ background: "var(--background-base)", border: "1px solid var(--border-base)" }}
            >
              <label class="block text-sm font-medium mb-2" style={{ color: "var(--text-strong)" }}>
                Create new folder in {DEFAULT_DIRECTORY}
              </label>
              <div class="flex gap-2">
                <input
                  type="text"
                  value={newFolderName()}
                  onInput={(e) => setNewFolderName(e.currentTarget.value)}
                  placeholder="my-new-project"
                  class="flex-1 px-3 py-2 rounded-md text-sm"
                  style={{
                    background: "var(--background-stronger)",
                    border: "1px solid var(--border-base)",
                    color: "var(--text-base)",
                  }}
                  onKeyDown={(e) => e.key === "Enter" && createFolder()}
                />
                <Button onClick={createFolder} variant="primary" disabled={!newFolderName().trim()}>
                  Create
                </Button>
              </div>
              <p class="mt-2 text-xs" style={{ color: "var(--text-weak)" }}>
                Will create: {DEFAULT_DIRECTORY}/{newFolderName() || "..."}
              </p>
            </div>
          </Show>

          {/* Recent projects */}
          <div
            class="rounded-lg overflow-hidden"
            style={{ background: "var(--background-base)", border: "1px solid var(--border-base)" }}
          >
            <div class="px-4 py-3" style={{ "border-bottom": "1px solid var(--border-base)" }}>
              <h3 class="font-medium" style={{ color: "var(--text-strong)" }}>
                Recent Projects
              </h3>
            </div>

            <Show
              when={!projects.loading}
              fallback={
                <div class="flex items-center justify-center py-8">
                  <Spinner class="w-6 h-6" style={{ color: "var(--text-interactive-base)" }} />
                </div>
              }
            >
              <Show
                when={validProjects().length > 0}
                fallback={
                  <div class="py-8 text-center" style={{ color: "var(--text-weak)" }}>
                    <svg
                      class="w-12 h-12 mx-auto mb-3 opacity-50"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.5"
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                      />
                    </svg>
                    <p>No recent projects</p>
                    <p class="text-sm mt-1">Open or create a folder to get started</p>
                  </div>
                }
              >
                <div class="divide-y" style={{ "border-color": "var(--border-base)" }}>
                  <For each={validProjects().slice(0, 10)}>
                    {(project) => (
                      <button
                        onClick={() => selectProject(project.worktree!)}
                        class="w-full flex items-center gap-3 p-3 text-left transition-colors"
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-inset)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
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
                        <svg
                          class="w-5 h-5 shrink-0"
                          style={{ color: "var(--icon-weak)" }}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </div>

          {/* Quick access to home directory */}
          <div class="mt-4 text-center">
            <button
              onClick={() => selectProject(DEFAULT_DIRECTORY)}
              class="text-sm transition-colors"
              style={{ color: "var(--text-interactive-base)" }}
              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
            >
              Open home directory ({DEFAULT_DIRECTORY})
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
