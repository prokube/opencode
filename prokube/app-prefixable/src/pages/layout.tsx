import { type ParentProps, createSignal, For, Show, onMount, createMemo } from "solid-js"
import { A, useLocation, useNavigate, useParams } from "@solidjs/router"
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import { useBasePath } from "../context/base-path"
import { useSDK } from "../context/sdk"
import { useEvents } from "../context/events"
import { useProviders } from "../context/providers"
import { base64Encode } from "../utils/path"
import { Spinner } from "@opencode-ai/ui/spinner"
import type { Session } from "@opencode-ai/sdk/v2/client"

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

export function Layout(props: ParentProps) {
  const { serverUrl, basePath } = useBasePath()
  const { client, directory } = useSDK()
  const events = useEvents()
  const providers = useProviders()
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams<{ dir: string }>()

  const [sessions, setSessions] = createSignal<Session[]>([])
  const [loading, setLoading] = createSignal(true)
  const [sidebarOpen, setSidebarOpen] = createSignal(true)
  const [expandedGroups, setExpandedGroups] = createSignal<Record<string, boolean>>({})

  // Current directory's base64-encoded slug for URLs
  const dirSlug = createMemo(() => (directory ? base64Encode(directory) : ""))

  // Group sessions by directory
  const sessionGroups = createMemo(() => {
    const allSessions = sessions()
    const groups: Record<string, Session[]> = {}

    // Always include the current directory, even if it has no sessions
    if (directory) {
      groups[directory] = []
    }

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
        // Current directory always first
        if (a.directory === directory) return -1
        if (b.directory === directory) return 1
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

  function getDirName(dir: string): string {
    return dir.split("/").pop() || dir
  }

  async function loadSessions() {
    try {
      console.log("[Layout] Loading sessions...")
      // Load sessions for all projects
      const res = await client.session.list({ roots: true })
      console.log("[Layout] Sessions response:", res)
      const data = res.data
      // Validate response is an array of sessions
      if (Array.isArray(data)) {
        // Filter to only valid sessions with id
        const valid = data.filter((s): s is Session => s && typeof s === "object" && typeof s.id === "string")
        console.log("[Layout] Valid sessions:", valid.length)
        setSessions(valid)
      } else {
        console.warn("[Layout] Unexpected session.list response, not an array:", typeof data)
        setSessions([])
      }
    } catch (e) {
      console.error("Failed to load sessions:", e)
      setSessions([])
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
        {/* Logo & Collapse */}
        <div class="flex items-center justify-between p-3" style={{ "border-bottom": "1px solid var(--border-base)" }}>
          {/* PK Icon - links to home */}
          <a href={basePath} class="shrink-0 hover:opacity-80 transition-opacity" title="Home">
            <PkIcon class="w-7 h-7 rounded" />
          </a>
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
                        <Show
                          when={group.sessions.length > 0}
                          fallback={
                            <div class="px-2.5 py-2 text-xs" style={{ color: "var(--text-weak)" }}>
                              No sessions yet
                            </div>
                          }
                        >
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
                        </Show>
                      </div>
                    </Show>
                  </div>
                )}
              </For>
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
