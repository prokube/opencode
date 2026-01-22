import { type ParentProps, createSignal, For, Show, onMount } from "solid-js"
import { A, useLocation, useNavigate } from "@solidjs/router"
import { useBasePath } from "../context/base-path"
import { useSDK } from "../context/sdk"
import { useEvents } from "../context/events"
import { useProviders } from "../context/providers"
import { Button } from "@opencode-ai/ui/button"
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
    <div class="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        class="flex flex-col bg-white border-r border-gray-200 transition-all duration-200"
        classList={{ "w-64": sidebarOpen(), "w-16": !sidebarOpen() }}
      >
        {/* Logo */}
        <div class="flex items-center justify-between p-4 border-b border-gray-200">
          <Show when={sidebarOpen()}>
            <A href={basePath} class="flex items-center gap-2 font-semibold text-gray-900">
              <div class="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                <svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              OpenCode
            </A>
          </Show>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen())}
            class="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
            title={sidebarOpen() ? "Collapse" : "Expand"}
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        <div class="p-3">
          <Show
            when={sidebarOpen()}
            fallback={
              <button
                onClick={createNewSession}
                class="w-full p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                title="New Session"
              >
                <svg class="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            }
          >
            <Button onClick={createNewSession} class="w-full" icon="plus">
              New Session
            </Button>
          </Show>
        </div>

        {/* Session List */}
        <div class="flex-1 overflow-y-auto">
          <Show when={loading()}>
            <div class="flex items-center justify-center py-8">
              <Spinner class="w-6 h-6 text-purple-600" />
            </div>
          </Show>

          <Show when={!loading() && sidebarOpen()}>
            <div class="px-2 space-y-1">
              <For each={sessions()}>
                {(session) => (
                  <A
                    href={`/session/${session.id}`}
                    class="block px-3 py-2 rounded-lg text-sm transition-colors"
                    classList={{
                      "bg-purple-50 text-purple-700 border border-purple-200": isActive(session.id),
                      "text-gray-700 hover:bg-gray-100": !isActive(session.id),
                    }}
                  >
                    <div class="font-medium truncate">{session.title || "Untitled"}</div>
                    <div class="text-xs text-gray-500 mt-0.5">{formatTime(session.time.updated)}</div>
                  </A>
                )}
              </For>

              <Show when={sessions().length === 0}>
                <div class="px-3 py-8 text-center text-sm text-gray-500">No sessions yet</div>
              </Show>
            </div>
          </Show>
        </div>

        {/* Bottom Nav */}
        <div class="border-t border-gray-200">
          {/* Provider Status */}
          <Show when={sidebarOpen()}>
            <div class="p-3 space-y-2">
              {/* Settings Link */}
              <A
                href="/settings"
                class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
                classList={{
                  "bg-purple-50 text-purple-700": location.pathname === "/settings",
                  "text-gray-700 hover:bg-gray-100": location.pathname !== "/settings",
                }}
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
                Settings
              </A>

              {/* Provider status indicator */}
              <div class="px-3 py-2 text-xs text-gray-500">
                <div class="flex items-center gap-2">
                  <Show
                    when={providers.connected.length > 0}
                    fallback={
                      <>
                        <span class="w-2 h-2 bg-yellow-500 rounded-full" />
                        <span>No providers</span>
                      </>
                    }
                  >
                    <span class="w-2 h-2 bg-green-500 rounded-full" />
                    <span>{providers.connected.length} provider(s)</span>
                  </Show>
                </div>
                <Show when={providers.selectedAgent}>
                  <div class="mt-1 text-gray-400">Agent: {providers.selectedAgent}</div>
                </Show>
              </div>
            </div>
          </Show>

          {/* Collapsed state */}
          <Show when={!sidebarOpen()}>
            <div class="p-3">
              <A
                href="/settings"
                class="flex items-center justify-center p-2 rounded-lg transition-colors"
                classList={{
                  "bg-purple-50 text-purple-700": location.pathname === "/settings",
                  "text-gray-500 hover:bg-gray-100": location.pathname !== "/settings",
                }}
                title="Settings"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      <main class="flex-1 flex flex-col overflow-hidden">{props.children}</main>
    </div>
  )
}
