import { type ParentProps, createSignal, For, Show, onMount, createMemo, onCleanup } from "solid-js"
import { A, useLocation, useNavigate } from "@solidjs/router"
import { useBasePath } from "../context/base-path"
import { useSDK } from "../context/sdk"
import { useEvents } from "../context/events"
import { useProviders } from "../context/providers"
import { useTerminal } from "../context/terminal"
import { base64Encode } from "../utils/path"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Terminal } from "../components/terminal"
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
  const { basePath } = useBasePath()
  const { client, directory } = useSDK()
  const events = useEvents()
  const providers = useProviders()
  const terminal = useTerminal()
  const location = useLocation()
  const navigate = useNavigate()

  const [sessions, setSessions] = createSignal<Session[]>([])
  const [loading, setLoading] = createSignal(true)
  const [sidebarOpen, setSidebarOpen] = createSignal(true)

  // Current directory's base64-encoded slug for URLs
  const dirSlug = createMemo(() => (directory ? base64Encode(directory) : ""))

  // Project name from directory
  const projectName = createMemo(() => {
    if (!directory) return "Project"
    return directory.split("/").pop() || directory
  })

  // Filter sessions to only show current project's sessions, sorted by updated time
  const projectSessions = createMemo(() =>
    sessions()
      .filter((s) => s.directory === directory)
      .sort((a, b) => (b.time?.updated || 0) - (a.time?.updated || 0)),
  )

  async function loadSessions() {
    try {
      console.log("[Layout] Loading sessions for:", directory)
      const res = await client.session.list({ roots: true })
      const data = res.data
      if (Array.isArray(data)) {
        const valid = data.filter((s): s is Session => s && typeof s === "object" && typeof s.id === "string")
        console.log("[Layout] Loaded sessions:", valid.length, "for current project:", projectSessions().length)
        setSessions(valid)
      } else {
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
      if (event.type === "session.created" || event.type === "session.updated" || event.type === "session.deleted") {
        loadSessions()
      }
    })

    // Keyboard shortcut: Ctrl+` to toggle terminal
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === "`") {
        e.preventDefault()
        terminal.toggle()
      }
    }
    window.addEventListener("keydown", handleKeyDown)

    onCleanup(() => {
      unsub()
      window.removeEventListener("keydown", handleKeyDown)
    })
  })

  async function createNewSession() {
    if (!directory) return
    try {
      const res = await client.session.create({})
      if (res.data) {
        // Add new session to list immediately
        setSessions((prev) => [res.data as Session, ...prev])
        navigate(`/${dirSlug()}/session/${res.data.id}`)
      }
    } catch (e) {
      console.error("Failed to create session:", e)
    }
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
        {/* Header: Logo & Project Name */}
        <div class="flex items-center justify-between p-3" style={{ "border-bottom": "1px solid var(--border-base)" }}>
          <div class="flex items-center gap-2 min-w-0">
            {/* PK Icon - links to home */}
            <a href={basePath} class="shrink-0 hover:opacity-80 transition-opacity" title="Change Project">
              <PkIcon class="w-7 h-7 rounded" />
            </a>
            {/* Project name */}
            <Show when={sidebarOpen()}>
              <div class="min-w-0">
                <div class="text-sm font-medium truncate" style={{ color: "var(--text-strong)" }}>
                  {projectName()}
                </div>
              </div>
            </Show>
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen())}
            class="p-1.5 rounded transition-colors shrink-0"
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

        {/* Session List */}
        <div class="flex-1 overflow-y-auto">
          <Show when={loading()}>
            <div class="flex items-center justify-center py-8">
              <Spinner class="w-5 h-5" style={{ color: "var(--text-interactive-base)" }} />
            </div>
          </Show>

          <Show when={!loading() && sidebarOpen()}>
            <div class="py-2 px-2 space-y-0.5">
              <Show
                when={projectSessions().length > 0}
                fallback={
                  <div class="py-6 text-center" style={{ color: "var(--text-weak)" }}>
                    <p class="text-sm">No sessions yet</p>
                    <p class="text-xs mt-1">Click "New Session" to start</p>
                  </div>
                }
              >
                <For each={projectSessions()}>
                  {(session) => (
                    <A
                      href={`/${dirSlug()}/session/${session.id}`}
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

        {/* Bottom Nav */}
        <div style={{ "border-top": "1px solid var(--border-base)" }}>
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

              {/* Terminal Button */}
              <button
                onClick={() => terminal.toggle()}
                class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors"
                style={{
                  color: terminal.opened() ? "var(--text-interactive-base)" : "var(--text-base)",
                  background: terminal.opened() ? "var(--surface-inset)" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!terminal.opened()) e.currentTarget.style.background = "var(--surface-inset)"
                }}
                onMouseLeave={(e) => {
                  if (!terminal.opened()) e.currentTarget.style.background = "transparent"
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
                    d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                Terminal
                <span class="ml-auto text-xs opacity-50">Ctrl+`</span>
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
              <button
                onClick={() => terminal.toggle()}
                class="flex items-center justify-center w-full p-1.5 rounded-md transition-colors"
                style={{
                  color: terminal.opened() ? "var(--text-interactive-base)" : "var(--icon-base)",
                  background: terminal.opened() ? "var(--surface-inset)" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!terminal.opened()) e.currentTarget.style.background = "var(--surface-inset)"
                }}
                onMouseLeave={(e) => {
                  if (!terminal.opened()) e.currentTarget.style.background = "transparent"
                }}
                title="Terminal (Ctrl+`)"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
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

      {/* Main Content + Terminal */}
      <div class="flex-1 flex flex-col overflow-hidden">
        {/* Main Content */}
        <main class="flex-1 flex flex-col overflow-hidden" style={{ background: "var(--background-stronger)" }}>
          {props.children}
        </main>

        {/* Terminal Panel - always rendered when sessions exist, visibility controlled by CSS */}
        <Show when={terminal.sessions().length > 0}>
          <div
            class="flex flex-col"
            style={{
              height: terminal.opened() ? `${terminal.height()}px` : "0px",
              overflow: "hidden",
              "border-top": terminal.opened() ? "1px solid var(--border-base)" : "none",
              background: "var(--background-base)",
              transition: "height 0.15s ease-out",
            }}
          >
            {/* Terminal Header */}
            <div
              class="flex items-center justify-between px-3 py-1.5 shrink-0"
              style={{ "border-bottom": "1px solid var(--border-base)" }}
            >
              <div class="flex items-center gap-2">
                {/* Terminal tabs */}
                <For each={terminal.sessions()}>
                  {(session) => (
                    <div
                      onClick={() => terminal.setActive(session.id)}
                      class="flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors cursor-pointer"
                      style={{
                        background: terminal.active() === session.id ? "var(--surface-inset)" : "transparent",
                        color: terminal.active() === session.id ? "var(--text-strong)" : "var(--text-weak)",
                      }}
                    >
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      {session.title}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          terminal.close(session.id)
                        }}
                        class="ml-1 p-0.5 rounded hover:bg-white/10"
                        style={{ color: "var(--icon-weak)" }}
                      >
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  )}
                </For>
                {/* New terminal button */}
                <button
                  onClick={() => terminal.create()}
                  class="p-1 rounded transition-colors"
                  style={{ color: "var(--icon-weak)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-inset)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  title="New Terminal"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>

              {/* Close button */}
              <button
                onClick={() => terminal.toggle()}
                class="p-1 rounded transition-colors"
                style={{ color: "var(--icon-weak)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-inset)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                title="Close Terminal"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            {/* Terminal Content */}
            <div class="flex-1 overflow-hidden">
              <For each={terminal.sessions()}>
                {(session) => (
                  <div
                    class="size-full"
                    style={{
                      display: terminal.active() === session.id ? "block" : "none",
                    }}
                  >
                    <Terminal ptyId={session.id} />
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}
