import { type ParentProps, createSignal, For, Show, onMount } from "solid-js"
import { A, useLocation, useNavigate } from "@solidjs/router"
import { useBasePath } from "../context/base-path"
import { useSDK } from "../context/sdk"
import { useEvents } from "../context/events"
import { useProviders } from "../context/providers"
import { Spinner } from "@opencode-ai/ui/spinner"
import type { Session } from "@opencode-ai/sdk/v2/client"

export function Layout(props: ParentProps) {
  const { basePath } = useBasePath()
  const { client } = useSDK()
  const events = useEvents()
  const providers = useProviders()
  const location = useLocation()
  const navigate = useNavigate()

  const [sessions, setSessions] = createSignal<Session[]>([])
  const [loading, setLoading] = createSignal(true)
  const [sidebarOpen, setSidebarOpen] = createSignal(true)

  async function loadSessions() {
    try {
      console.log("[Layout] Loading sessions...")
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

  async function createNewSession() {
    try {
      console.log("[Layout] Creating new session...")
      const res = await client.session.create({})
      console.log("[Layout] Create response:", res)
      if (res.data) {
        console.log("[Layout] Navigating to:", `/session/${res.data.id}`)
        navigate(`/session/${res.data.id}`)
      }
    } catch (e) {
      console.error("Failed to create session:", e)
    }
  }

  function isActive(path: string) {
    return location.pathname.includes(path)
  }

  function formatTime(timestamp: number) {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    if (diff < 60000) return "just now"
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return date.toLocaleDateString()
  }

  return (
    <div class="flex h-screen" style={{ background: "var(--background-stronger)" }}>
      {/* Sidebar */}
      <aside
        class="flex flex-col transition-all duration-200"
        classList={{ "w-60": sidebarOpen(), "w-12": !sidebarOpen() }}
        style={{
          background: "var(--background-base)",
          "border-right": "1px solid var(--border-base)",
        }}
      >
        {/* Logo */}
        <div class="flex items-center justify-between p-3" style={{ "border-bottom": "1px solid var(--border-base)" }}>
          <Show when={sidebarOpen()}>
            <A
              href={basePath}
              class="flex items-center gap-2 text-sm font-medium"
              style={{ color: "var(--text-strong)" }}
            >
              <div class="w-6 h-6 bg-purple-600 rounded flex items-center justify-center">
                <svg class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <span>OpenCode</span>
            </A>
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

        {/* New Session Button */}
        <div class="p-2">
          <Show
            when={sidebarOpen()}
            fallback={
              <button
                onClick={createNewSession}
                class="w-full flex items-center justify-center p-2 rounded-md text-icon-base hover:bg-surface-inset transition-colors"
                title="New Session"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            }
          >
            <button
              onClick={createNewSession}
              class="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-text-base rounded-md hover:bg-surface-inset transition-colors"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              New Session
            </button>
          </Show>
        </div>

        {/* Session List */}
        <div class="flex-1 overflow-y-auto">
          <Show when={loading()}>
            <div class="flex items-center justify-center py-8">
              <Spinner class="w-5 h-5" style={{ color: "var(--text-interactive-base)" }} />
            </div>
          </Show>

          <Show when={!loading() && sidebarOpen()}>
            <div class="px-1.5 py-1 space-y-0.5">
              <For each={sessions()}>
                {(session) => (
                  <A
                    href={`/session/${session.id}`}
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

              <Show when={sessions().length === 0}>
                <div class="px-2.5 py-6 text-center text-sm" style={{ color: "var(--text-weak)" }}>
                  No sessions yet
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
              {/* Settings Link */}
              <A
                href="/settings"
                class="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors"
                style={{
                  color: location.pathname === "/settings" ? "var(--text-interactive-base)" : "var(--text-base)",
                  background: location.pathname === "/settings" ? "var(--surface-inset)" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (location.pathname !== "/settings") e.currentTarget.style.background = "var(--surface-inset)"
                }}
                onMouseLeave={(e) => {
                  if (location.pathname !== "/settings") e.currentTarget.style.background = "transparent"
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
            <div class="p-1.5">
              <A
                href="/settings"
                class="flex items-center justify-center p-1.5 rounded-md transition-colors"
                style={{
                  color: location.pathname === "/settings" ? "var(--text-interactive-base)" : "var(--icon-base)",
                  background: location.pathname === "/settings" ? "var(--surface-inset)" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (location.pathname !== "/settings") e.currentTarget.style.background = "var(--surface-inset)"
                }}
                onMouseLeave={(e) => {
                  if (location.pathname !== "/settings") e.currentTarget.style.background = "transparent"
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
