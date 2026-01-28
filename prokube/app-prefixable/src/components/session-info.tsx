import { createSignal, createMemo, onMount, onCleanup, Show } from "solid-js"
import { useParams } from "@solidjs/router"
import { useSDK } from "../context/sdk"
import { useProviders } from "../context/providers"
import { GitBranch, Zap, CornerDownLeft, Square } from "lucide-solid"

interface SessionInfoProps {
  input: () => string
  loading: () => boolean
  processing: () => boolean
  onAbort: () => void
}

export function SessionInfo(props: SessionInfoProps) {
  const params = useParams<{ dir: string; id?: string }>()
  const { client, directory } = useSDK()
  const providers = useProviders()

  const [gitBranch, setGitBranch] = createSignal<string | null>(null)
  const [messages, setMessages] = createSignal<any[]>([])

  // Load git branch - disabled for now, no bash endpoint in SDK
  async function loadGitBranch() {
    // TODO: Add git branch endpoint to SDK or use a different approach
    // The bash.run endpoint doesn't exist in the current SDK
  }

  // Load messages to calculate token usage
  async function loadMessages() {
    const id = params.id
    if (!id) {
      setMessages([])
      return
    }
    try {
      const res = await client.session.messages({ sessionID: id })
      if (res.data) {
        setMessages(res.data)
      }
    } catch (e) {
      console.error("Failed to load messages:", e)
    }
  }

  onMount(() => {
    loadGitBranch()
    loadMessages()
  })

  // Reload messages when session ID changes
  onMount(() => {
    let active = true
    const interval = setInterval(() => {
      if (active && params.id) loadMessages()
    }, 5000) // Refresh every 5 seconds

    onCleanup(() => {
      active = false
      clearInterval(interval)
    })
  })

  // Calculate token usage and cost from messages
  const stats = createMemo(() => {
    const msgs = messages()
    if (!msgs.length) return null

    let totalTokens = 0
    let totalCost = 0

    for (const msg of msgs) {
      if (msg.info?.role === "assistant") {
        const tokens = msg.info.tokens || {}
        const msgTokens =
          (tokens.input || 0) +
          (tokens.output || 0) +
          (tokens.reasoning || 0) +
          (tokens.cache?.read || 0) +
          (tokens.cache?.write || 0)
        totalTokens += msgTokens
        totalCost += msg.info.cost || 0
      }
    }

    if (totalTokens === 0) return null

    return {
      tokens: totalTokens.toLocaleString(),
      cost: new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      }).format(totalCost),
    }
  })

  const dirSlug = createMemo(() => params.dir)

  return (
    <div class="flex items-center gap-3 px-4 py-1.5 text-xs flex-wrap" style={{ color: "var(--text-weak)" }}>
      {/* Git Branch */}
      <Show when={gitBranch()}>
        {(branch) => (
          <span class="flex items-center gap-1.5 shrink-0">
            <GitBranch class="w-3 h-3" />
            <span style={{ color: "var(--text-base)" }}>{branch()}</span>
          </span>
        )}
      </Show>

      {/* Agent */}
      <Show when={providers.selectedAgent}>
        <span class="flex items-center gap-1 shrink-0">
          <span class="opacity-60">Agent:</span>
          <span class="capitalize" style={{ color: "var(--text-base)" }}>
            {providers.selectedAgent}
          </span>
        </span>
      </Show>

      {/* Model */}
      <Show when={providers.selectedModel}>
        {(model) => (
          <span class="flex items-center gap-1 shrink-0">
            <span class="opacity-60">Model:</span>
            <span style={{ color: "var(--text-base)" }}>{model().modelID}</span>
          </span>
        )}
      </Show>

      {/* Token Usage */}
      <Show when={stats()}>
        {(s) => (
          <>
            <span class="flex items-center gap-1.5 shrink-0">
              <Zap class="w-3 h-3" />
              <span style={{ color: "var(--text-base)" }}>{s().tokens}</span>
              <span class="opacity-60">tokens</span>
            </span>
            <span class="flex items-center gap-1.5 shrink-0">
              <span class="opacity-60">Cost:</span>
              <span style={{ color: "var(--text-base)" }}>{s().cost}</span>
            </span>
          </>
        )}
      </Show>

      {/* No provider warning */}
      <Show when={!providers.selectedModel && providers.connected.length === 0}>
        <a href={`/${dirSlug()}/settings`} style={{ color: "var(--text-interactive-base)" }} class="hover:underline">
          Connect a provider to start
        </a>
      </Show>

      <Show when={!providers.selectedModel && providers.connected.length > 0}>
        <span style={{ color: "var(--status-warning-text)" }}>No model selected</span>
      </Show>

      {/* Enter hint / Stop button - pushed to right */}
      <div class="ml-auto flex items-center">
        <Show
          when={props.processing()}
          fallback={
            <Show when={props.input().trim() && !props.loading()}>
              <span class="flex items-center gap-1 opacity-50" title="Press Enter to send">
                <span class="font-mono text-[10px] px-1 py-0.5 rounded" style={{ background: "var(--surface-inset)" }}>
                  Enter
                </span>
                <CornerDownLeft class="w-3 h-3" />
              </span>
            </Show>
          }
        >
          <button
            type="button"
            onClick={props.onAbort}
            class="flex items-center gap-1.5 px-2 py-1 rounded transition-colors"
            style={{
              color: "var(--text-critical-base)",
              border: "1px solid var(--border-critical-base)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-critical-subtle)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            title="Stop generation (Esc)"
          >
            <Square class="w-3 h-3" />
            <span>Stop</span>
          </button>
        </Show>
      </div>
    </div>
  )
}
