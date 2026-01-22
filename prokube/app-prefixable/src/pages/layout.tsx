import { type ParentProps, createSignal, For, Show, onMount, onCleanup, createResource, createMemo } from "solid-js"
import { A, useLocation, useNavigate, useParams } from "@solidjs/router"
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import { useBasePath } from "../context/base-path"
import { useSDK } from "../context/sdk"
import { useEvents } from "../context/events"
import { useProviders } from "../context/providers"
import { base64Encode } from "../utils/path"
import { Spinner } from "@opencode-ai/ui/spinner"
import type { Session } from "@opencode-ai/sdk/v2/client"

interface Project {
  id: string
  worktree: string
  name?: string
  vcs?: string
  icon?: { color?: string }
}

export function Layout(props: ParentProps) {
  const { serverUrl } = useBasePath()
  const { client, directory } = useSDK()
  const events = useEvents()
  const providers = useProviders()
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams<{ dir: string }>()

  const [sessions, setSessions] = createSignal<Session[]>([])
  const [loading, setLoading] = createSignal(true)
  const [sidebarOpen, setSidebarOpen] = createSignal(true)
  const [showProjectPicker, setShowProjectPicker] = createSignal(false)
  const [expandedGroups, setExpandedGroups] = createSignal<Record<string, boolean>>({})
  let projectPickerRef: HTMLDivElement | undefined

  // Current directory's base64-encoded slug for URLs
  const dirSlug = createMemo(() => (directory ? base64Encode(directory) : ""))

  // Group sessions by directory
  const sessionGroups = createMemo(() => {
    const allSessions = sessions()
    const groups: Record<string, Session[]> = {}

    for (const session of allSessions) {
      const dir = session.directory || "unknown"
      if (!groups[dir]) groups[dir] = []
      groups[dir].push(session)
    }

    // Convert to array
    const entries = Object.entries(groups).map(([dir, dirSessions]) => ({
      directory: dir,
      slug: base64Encode(dir),
      sessions: dirSessions.sort((a, b) => (b.time?.updated || 0) - (a.time?.updated || 0)),
    }))

    // Generate unique display names
    // If multiple directories have the same last segment, show more path
    const lastSegments: Record<string, string[]> = {}
    for (const entry of entries) {
      const last = entry.directory.split("/").pop() || entry.directory
      if (!lastSegments[last]) lastSegments[last] = []
      lastSegments[last].push(entry.directory)
    }

    return entries
      .map((entry) => {
        const last = entry.directory.split("/").pop() || entry.directory
        const duplicates = lastSegments[last] || []
        let name = last
        if (duplicates.length > 1) {
          // Show parent/child for disambiguation
          const parts = entry.directory.split("/")
          if (parts.length >= 2) {
            name = parts.slice(-2).join("/")
          }
        }
        return { ...entry, name }
      })
      .sort((a, b) => {
        const aTime = a.sessions[0]?.time?.updated || 0
        const bTime = b.sessions[0]?.time?.updated || 0
        return bTime - aTime
      })
  })

  function isGroupExpanded(dir: string): boolean {
    const expanded = expandedGroups()
    if (expanded[dir] !== undefined) return expanded[dir]
    // Default: current directory expanded
    return dir === directory
  }

  function toggleGroup(dir: string) {
    setExpandedGroups((prev) => ({ ...prev, [dir]: !isGroupExpanded(dir) }))
  }

  // Close project picker on click outside
  function handleClickOutside(e: MouseEvent) {
    if (projectPickerRef && !projectPickerRef.contains(e.target as Node)) {
      setShowProjectPicker(false)
    }
  }

  onMount(() => {
    document.addEventListener("click", handleClickOutside)
  })

  onCleanup(() => {
    document.removeEventListener("click", handleClickOutside)
  })

  // Fetch all projects (global, not directory-specific)
  const [projects] = createResource(async () => {
    try {
      // Use a client without directory for global calls
      const globalClient = createOpencodeClient({ baseUrl: serverUrl, throwOnError: true })
      const res = await globalClient.project.list()
      return (res.data as Project[]) ?? []
    } catch (e) {
      console.error("Failed to fetch projects:", e)
      return []
    }
  })

  // Current project based on directory
  const currentProject = createMemo(() => {
    const all = projects() || []
    return all.find((p) => p.worktree === directory)
  })

  function getProjectName(project: Project): string {
    return project.name || project.worktree.split("/").pop() || project.worktree
  }

  function getDirName(dir: string): string {
    return dir.split("/").pop() || dir
  }

  async function loadSessions() {
    try {
      console.log("[Layout] Loading sessions...")
      // Load sessions for all projects
      const res = await client.session.list({ roots: true })
      console.log("[Layout] Sessions response:", res)
      if (res.data) {
        setSessions(res.data)
      }
    } catch (e) {
      console.error("Failed to load sessions:", e)
    } finally {
      setLoading(false)
    }
  }

  onMount(() => {
    loadSessions()

    // Subscribe to session events
    const unsub = events.subscribe((event) => {
      console.log("[Layout] Event received:", event.type)
      if (event.type === "session.created" || event.type === "session.updated" || event.type === "session.deleted") {
        loadSessions()
      }
    })

    return unsub
  })

  // Create session in a specific directory
  async function createSessionInDirectory(targetDir: string) {
    try {
      console.log("[Layout] Creating session in:", targetDir)
      // Create a client for the target directory
      const targetClient = createOpencodeClient({
        baseUrl: serverUrl,
        directory: targetDir,
        throwOnError: true,
      })
      const res = await targetClient.session.create({})
      console.log("[Layout] Create response:", res)
      if (res.data) {
        const slug = base64Encode(targetDir)
        navigate(`/${slug}/session/${res.data.id}`)
      }
    } catch (e) {
      console.error("Failed to create session:", e)
    }
  }

  // Create session in current directory
  async function createNewSession() {
    if (!directory) return
    await createSessionInDirectory(directory)
  }

  function navigateToProject(worktree: string) {
    const slug = base64Encode(worktree)
    navigate(`/${slug}/session`)
    setShowProjectPicker(false)
  }

  function isActive(sessionId: string) {
    return location.pathname.includes(sessionId)
  }

  function isSettingsActive() {
    return location.pathname.endsWith("/settings")
  }

  return (
    <div class="flex h-screen" style={{ background: "var(--background-stronger)" }}>
      {/* Sidebar */}
      <aside
        class="flex flex-col transition-all duration-200"
        classList={{ "w-64": sidebarOpen(), "w-12": !sidebarOpen() }}
        style={{
          background: "var(--background-base)",
          "border-right": "1px solid var(--border-base)",
        }}
      >
        {/* Logo & Project */}
        <div class="flex items-center justify-between p-3" style={{ "border-bottom": "1px solid var(--border-base)" }}>
          <Show when={sidebarOpen()}>
            <div class="flex-1 min-w-0">
              {/* Project Picker */}
              <div class="relative" ref={projectPickerRef}>
                <button
                  onClick={() => setShowProjectPicker(!showProjectPicker())}
                  class="flex items-center gap-2 text-sm font-medium w-full text-left rounded-md p-1 -m-1 transition-colors"
                  style={{ color: "var(--text-strong)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-inset)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div class="w-6 h-6 bg-purple-600 rounded flex items-center justify-center shrink-0">
                    <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                      />
                    </svg>
                  </div>
                  <span class="truncate">{directory ? getDirName(directory) : "Loading..."}</span>
                  <svg
                    class="w-3 h-3 shrink-0"
                    style={{ color: "var(--icon-weak)" }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Project Dropdown */}
                <Show when={showProjectPicker()}>
                  <div
                    class="absolute left-0 top-full mt-1 w-72 rounded-lg shadow-lg z-50 overflow-hidden"
                    style={{
                      background: "var(--background-base)",
                      border: "1px solid var(--border-base)",
                    }}
                  >
                    <div
                      class="px-3 py-2 text-xs font-medium"
                      style={{
                        color: "var(--text-weak)",
                        background: "var(--surface-inset)",
                        "border-bottom": "1px solid var(--border-base)",
                      }}
                    >
                      Switch Project
                    </div>
                    <div class="max-h-64 overflow-y-auto">
                      <For each={projects()}>
                        {(project) => {
                          const isCurrent = project.worktree === directory
                          return (
                            <button
                              onClick={() => navigateToProject(project.worktree)}
                              class="w-full px-3 py-2 text-sm flex items-center gap-2 transition-colors text-left"
                              style={{
                                color: isCurrent ? "var(--text-interactive-base)" : "var(--text-base)",
                                background: isCurrent ? "var(--surface-inset)" : "transparent",
                              }}
                              onMouseEnter={(e) => {
                                if (!isCurrent) e.currentTarget.style.background = "var(--surface-inset)"
                              }}
                              onMouseLeave={(e) => {
                                if (!isCurrent) e.currentTarget.style.background = "transparent"
                              }}
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
                              <div class="flex-1 min-w-0">
                                <div class="truncate font-medium">{getProjectName(project)}</div>
                                <div class="truncate text-xs" style={{ color: "var(--text-weak)" }}>
                                  {project.worktree}
                                </div>
                              </div>
                              <Show when={isCurrent}>
                                <svg
                                  class="w-4 h-4 shrink-0"
                                  style={{ color: "var(--text-interactive-base)" }}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              </Show>
                            </button>
                          )
                        }}
                      </For>
                    </div>
                  </div>
                </Show>
              </div>
            </div>
          </Show>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen())}
            class="p-1.5 rounded transition-colors"
            style={{ color: "var(--icon-base)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-inset)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            title={sidebarOpen() ? "Collapse" : "Expand"}
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d={sidebarOpen() ? "M11 19l-7-7 7-7m8 14l-7-7 7-7" : "M13 5l7 7-7 7M5 5l7 7-7 7"}
              />
            </svg>
          </button>
        </div>

        {/* Session List - Grouped by Project */}
        <div class="flex-1 overflow-y-auto">
          <Show when={loading()}>
            <div class="flex items-center justify-center py-8">
              <Spinner class="w-5 h-5" style={{ color: "var(--text-interactive-base)" }} />
            </div>
          </Show>

          <Show when={!loading() && sidebarOpen()}>
            <div class="py-1">
              <For each={sessionGroups()}>
                {(group) => (
                  <div class="mb-1">
                    {/* Group Header */}
                    <div class="flex items-center">
                      <button
                        onClick={() => toggleGroup(group.directory)}
                        class="flex-1 flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-colors"
                        style={{ color: "var(--text-weak)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-inset)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <svg
                          class="w-3 h-3 transition-transform"
                          classList={{ "rotate-90": isGroupExpanded(group.directory) }}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                        </svg>
                        <svg
                          class="w-3 h-3"
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
                        <span class="truncate flex-1 text-left">{group.name}</span>
                        <span class="text-xs opacity-60">{group.sessions.length}</span>
                      </button>
                      {/* Add session button for this project */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          createSessionInDirectory(group.directory)
                        }}
                        class="p-1 mr-2 rounded transition-colors"
                        style={{ color: "var(--icon-weak)" }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "var(--surface-inset)"
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent"
                        }}
                        title={`New session in ${group.name}`}
                      >
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </div>

                    {/* Sessions in this group */}
                    <Show when={isGroupExpanded(group.directory)}>
                      <div class="pl-4 pr-1.5 space-y-0.5">
                        <For each={group.sessions}>
                          {(session) => (
                            <A
                              href={`/${group.slug}/session/${session.id}`}
                              class="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors"
                              style={{
                                color: isActive(session.id) ? "var(--text-interactive-base)" : "var(--text-base)",
                                background: isActive(session.id) ? "var(--surface-inset)" : "transparent",
                              }}
                              onMouseEnter={(e) => {
                                if (!isActive(session.id)) e.currentTarget.style.background = "var(--surface-inset)"
                              }}
                              onMouseLeave={(e) => {
                                if (!isActive(session.id)) e.currentTarget.style.background = "transparent"
                              }}
                            >
                              <svg
                                class="w-3.5 h-3.5 shrink-0"
                                style={{ color: "var(--icon-weak)" }}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  stroke-width="2"
                                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                                />
                              </svg>
                              <div class="flex-1 min-w-0">
                                <div class="truncate text-sm">{session.title || "Untitled"}</div>
                              </div>
                            </A>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                )}
              </For>

              <Show when={sessions().length === 0}>
                <div class="px-3 py-6 text-center">
                  <p class="text-sm mb-3" style={{ color: "var(--text-weak)" }}>
                    No sessions yet
                  </p>
                  <button
                    onClick={createNewSession}
                    class="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors"
                    style={{
                      background: "var(--surface-interactive-base)",
                      color: "var(--text-interactive-base)",
                    }}
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                    </svg>
                    New Session
                  </button>
                </div>
              </Show>
            </div>
          </Show>
        </div>

        {/* Bottom Nav */}
        <div style={{ "border-top": "1px solid var(--border-base)" }}>
          {/* Provider Status */}
          <Show when={sidebarOpen()}>
            <div class="p-2 space-y-1">
              {/* New Session Button */}
              <button
                onClick={createNewSession}
                class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors"
                style={{ color: "var(--text-base)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-inset)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <svg
                  class="w-4 h-4"
                  style={{ color: "var(--icon-base)" }}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                New Session
              </button>

              {/* Settings Link */}
              <A
                href={`/${dirSlug()}/settings`}
                class="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors"
                style={{
                  color: isSettingsActive() ? "var(--text-interactive-base)" : "var(--text-base)",
                  background: isSettingsActive() ? "var(--surface-inset)" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!isSettingsActive()) e.currentTarget.style.background = "var(--surface-inset)"
                }}
                onMouseLeave={(e) => {
                  if (!isSettingsActive()) e.currentTarget.style.background = "transparent"
                }}
              >
                <svg
                  class="w-4 h-4"
                  style={{ color: "var(--icon-base)" }}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                Settings
              </A>

              {/* Provider status indicator */}
              <div class="px-2.5 py-1.5 text-xs" style={{ color: "var(--text-weak)" }}>
                <div class="flex items-center gap-2">
                  <Show
                    when={providers.connected.length > 0}
                    fallback={
                      <>
                        <span class="w-1.5 h-1.5 bg-yellow-500 rounded-full" />
                        <span>No providers</span>
                      </>
                    }
                  >
                    <span class="w-1.5 h-1.5 bg-green-500 rounded-full" />
                    <span>{providers.connected.length} provider(s)</span>
                  </Show>
                </div>
              </div>
            </div>
          </Show>

          {/* Collapsed state */}
          <Show when={!sidebarOpen()}>
            <div class="p-1.5 space-y-1">
              <button
                onClick={createNewSession}
                class="flex items-center justify-center w-full p-1.5 rounded-md transition-colors"
                style={{ color: "var(--icon-base)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-inset)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                title="New Session"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <A
                href={`/${dirSlug()}/settings`}
                class="flex items-center justify-center p-1.5 rounded-md transition-colors"
                style={{
                  color: isSettingsActive() ? "var(--text-interactive-base)" : "var(--icon-base)",
                  background: isSettingsActive() ? "var(--surface-inset)" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!isSettingsActive()) e.currentTarget.style.background = "var(--surface-inset)"
                }}
                onMouseLeave={(e) => {
                  if (!isSettingsActive()) e.currentTarget.style.background = "transparent"
                }}
                title="Settings"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </A>
            </div>
          </Show>
        </div>
      </aside>

      {/* Main Content */}
      <main class="flex-1 flex flex-col overflow-hidden" style={{ background: "var(--background-stronger)" }}>
        {props.children}
      </main>
    </div>
  )
}
