import { createSignal, createResource, Show, For, onMount, createEffect, onCleanup, createMemo } from "solid-js"
import { useParams, useNavigate } from "@solidjs/router"
import { Button } from "@opencode-ai/ui/button"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useSDK } from "../context/sdk"
import { useEvents } from "../context/events"
import { useProviders } from "../context/providers"
import { Markdown } from "../components/markdown"
import { base64Encode } from "../utils/path"
import type { Part } from "@opencode-ai/sdk/v2/client"

interface Command {
  id: string
  title: string
  description?: string
  slash?: string
  onSelect: () => void
}

interface DisplayMessage {
  id: string
  role: "user" | "assistant"
  parts: Part[]
}

function extractTextContent(parts: Part[]): string {
  return parts
    .filter((p): p is Part & { type: "text" } => p.type === "text")
    .map((p) => p.text)
    .join("")
}

export function Session() {
  const params = useParams<{ dir: string; id?: string }>()
  const navigate = useNavigate()
  const { client, directory } = useSDK()
  const events = useEvents()
  const providers = useProviders()

  // Helper to get the current directory slug
  const dirSlug = createMemo(() => (directory ? base64Encode(directory) : params.dir))

  const [input, setInput] = createSignal("")
  const [messages, setMessages] = createSignal<DisplayMessage[]>([])
  const [loading, setLoading] = createSignal(false)
  const [processing, setProcessing] = createSignal(false)
  const [sessionId, setSessionId] = createSignal(params.id)
  const [showModelPicker, setShowModelPicker] = createSignal(false)
  const [showAgentPicker, setShowAgentPicker] = createSignal(false)
  const [showSlashPopover, setShowSlashPopover] = createSignal(false)
  const [slashQuery, setSlashQuery] = createSignal("")
  const [slashIndex, setSlashIndex] = createSignal(0)
  let messagesEndRef: HTMLDivElement | undefined
  let inputRef: HTMLInputElement | undefined
  let agentPickerRef: HTMLDivElement | undefined
  let modelPickerRef: HTMLDivElement | undefined
  let slashPopoverRef: HTMLDivElement | undefined

  // Define slash commands directly (not through context to avoid reactivity issues)
  const slashCommands: Command[] = [
    {
      id: "session.new",
      title: "New Session",
      description: "Create a new chat session",
      slash: "new",
      onSelect: () => {
        console.log("[Command] New session")
        navigate(`/${dirSlug()}/session`)
      },
    },
    {
      id: "settings.open",
      title: "Settings",
      description: "Open settings page",
      slash: "settings",
      onSelect: () => {
        console.log("[Command] Settings")
        navigate(`/${dirSlug()}/settings`)
      },
    },
    {
      id: "provider.connect",
      title: "Connect Provider",
      description: "Add an AI provider",
      slash: "connect",
      onSelect: () => {
        console.log("[Command] Connect")
        navigate(`/${dirSlug()}/settings`)
      },
    },
    {
      id: "model.choose",
      title: "Choose Model",
      description: "Select the AI model to use",
      slash: "model",
      onSelect: () => {
        console.log("[Command] Model picker")
        setShowModelPicker(true)
      },
    },
    {
      id: "agent.choose",
      title: "Choose Agent",
      description: "Select the agent to use",
      slash: "agent",
      onSelect: () => {
        console.log("[Command] Agent picker")
        setShowAgentPicker(true)
      },
    },
  ]

  // Filtered slash commands based on query
  const filteredSlashCommands = createMemo(() => {
    const q = slashQuery().toLowerCase()
    if (!q) return slashCommands
    return slashCommands.filter(
      (c) =>
        c.slash?.toLowerCase().startsWith(q) ||
        c.title.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q),
    )
  })

  // Close dropdowns on click outside
  function handleClickOutside(e: MouseEvent) {
    const target = e.target as Node

    // Don't close if clicking inside the input (for slash commands)
    if (inputRef?.contains(target)) return

    if (agentPickerRef && !agentPickerRef.contains(target)) {
      setShowAgentPicker(false)
    }
    if (modelPickerRef && !modelPickerRef.contains(target)) {
      setShowModelPicker(false)
    }
    if (slashPopoverRef && !slashPopoverRef.contains(target)) {
      setShowSlashPopover(false)
    }
  }

  // Handle slash command selection
  function selectSlashCommand(cmd: Command) {
    console.log("[Session] Selecting command:", cmd.id)
    setInput("")
    setShowSlashPopover(false)
    setSlashQuery("")

    // Use setTimeout to ensure state updates before command runs
    setTimeout(() => {
      console.log("[Session] Executing command:", cmd.id)
      cmd.onSelect()
    }, 0)
  }

  // Handle input changes to detect slash commands
  function handleInputChange(value: string) {
    setInput(value)

    // Detect slash command pattern: starts with / and is the only content
    const slashMatch = value.match(/^\/(\S*)$/)
    if (slashMatch) {
      console.log("[Session] Slash match:", slashMatch[1])
      setSlashQuery(slashMatch[1])
      setShowSlashPopover(true)
      setSlashIndex(0)
    } else {
      setShowSlashPopover(false)
      setSlashQuery("")
    }
  }

  // Handle keyboard navigation in slash popover
  function handleInputKeyDown(e: KeyboardEvent) {
    if (!showSlashPopover()) return

    const cmds = filteredSlashCommands()
    if (cmds.length === 0) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSlashIndex((i) => (i + 1) % cmds.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSlashIndex((i) => (i - 1 + cmds.length) % cmds.length)
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault()
      const cmd = cmds[slashIndex()]
      if (cmd) {
        selectSlashCommand(cmd)
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      setShowSlashPopover(false)
      setSlashQuery("")
    }
  }

  onMount(() => {
    document.addEventListener("click", handleClickOutside)
  })

  onCleanup(() => {
    document.removeEventListener("click", handleClickOutside)
  })

  // Fetch existing session
  const [session, { refetch: refetchSession }] = createResource(
    () => params.id,
    async (id) => {
      if (!id) return null
      try {
        const res = await client.session.get({ sessionID: id })
        return res.data ?? null
      } catch {
        return null
      }
    },
  )

  // Load messages
  async function loadMessages(id: string) {
    try {
      console.log("[Session] Loading messages for:", id)
      const res = await client.session.messages({ sessionID: id })
      if (res.data) {
        const msgs: DisplayMessage[] = res.data.map((msg) => ({
          id: msg.info.id,
          role: msg.info.role as "user" | "assistant",
          parts: msg.parts,
        }))
        console.log("[Session] Loaded messages:", msgs.length)
        setMessages(msgs)
      }
    } catch (e) {
      console.error("Failed to load messages:", e)
    }
  }

  // Poll for status and reload messages when done
  async function waitForCompletion(id: string) {
    console.log("[Session] Waiting for completion...")
    setProcessing(true)

    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 500))

      try {
        const res = await client.session.status({})
        const statuses = res.data as Record<string, { type: string }> | undefined
        if (!statuses) continue

        const status = statuses[id]
        console.log("[Session] Status:", status?.type)

        if (!status || status.type === "idle") {
          console.log("[Session] Complete, reloading messages...")
          await loadMessages(id)
          setProcessing(false)
          return
        }
      } catch (e) {
        console.error("[Session] Status check failed:", e)
      }
    }

    // Timeout - reload anyway
    console.log("[Session] Timeout, reloading messages...")
    await loadMessages(id)
    setProcessing(false)
  }

  // Subscribe to events for real-time updates
  onMount(() => {
    if (params.id) {
      loadMessages(params.id)
    }

    const unsub = events.subscribe((event) => {
      const id = sessionId()
      if (!id) return

      console.log("[Session] Event:", event.type)

      // Handle message part updates
      if (event.type === "message.part.updated") {
        const part = event.properties.part
        if (part.sessionID !== id) return

        setMessages((prev) => {
          const msgIndex = prev.findIndex((m) => m.id === part.messageID)
          if (msgIndex === -1) {
            return [
              ...prev,
              {
                id: part.messageID,
                role: "assistant" as const,
                parts: [part],
              },
            ]
          }

          const msg = prev[msgIndex]
          const partIndex = msg.parts.findIndex((p) => p.id === part.id)
          const newParts =
            partIndex === -1 ? [...msg.parts, part] : msg.parts.map((p, i) => (i === partIndex ? part : p))

          return prev.map((m, i) => (i === msgIndex ? { ...m, parts: newParts } : m))
        })
      }

      // Handle status changes
      if (event.type === "session.status") {
        const props = event.properties as { sessionID: string; status: { type: string } }
        if (props.sessionID === id && props.status.type === "idle") {
          console.log("[Session] Status idle, reloading...")
          loadMessages(id)
          setProcessing(false)
        } else if (props.sessionID === id) {
          setProcessing(true)
        }
      }

      // Handle session updates
      if (event.type === "session.updated") {
        refetchSession()
      }
    })

    return unsub
  })

  // Auto-scroll to bottom
  createEffect(() => {
    messages()
    messagesEndRef?.scrollIntoView({ behavior: "smooth" })
  })

  // Focus input on mount
  onMount(() => {
    inputRef?.focus()
  })

  async function sendMessage(e: SubmitEvent) {
    e.preventDefault()
    const text = input().trim()
    if (!text || loading()) return

    setLoading(true)
    setInput("")

    // Optimistic update
    const userMessage: DisplayMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ id: crypto.randomUUID(), sessionID: sessionId() || "", messageID: "", type: "text", text }] as Part[],
    }
    setMessages((prev) => [...prev, userMessage])

    try {
      let id = sessionId()

      if (!id) {
        console.log("[Session] Creating new session...")
        const createRes = await client.session.create({})
        console.log("[Session] Create response:", createRes)
        if (!createRes.data) throw new Error("Failed to create session")

        id = createRes.data.id
        setSessionId(id)
        navigate(`/${dirSlug()}/session/${id}`, { replace: true })
      }

      // Send message with agent and model
      console.log("[Session] Sending message to session:", id)
      const promptPayload: {
        sessionID: string
        parts: { type: "text"; text: string }[]
        agent?: string
        model?: { providerID: string; modelID: string }
      } = {
        sessionID: id,
        parts: [{ type: "text", text }],
      }

      if (providers.selectedAgent) {
        promptPayload.agent = providers.selectedAgent
      }

      if (providers.selectedModel) {
        promptPayload.model = providers.selectedModel
      }

      const promptRes = await client.session.promptAsync(promptPayload)
      console.log("[Session] Prompt response:", promptRes)

      // Start polling for completion (SSE might not work through proxy)
      waitForCompletion(id)
    } catch (err) {
      console.error("Error sending message:", err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="flex flex-col h-full">
      {/* Header */}
      <header
        class="flex items-center justify-between px-6 py-3"
        style={{
          background: "var(--background-base)",
          "border-bottom": "1px solid var(--border-base)",
        }}
      >
        <div>
          <h1 class="text-base font-medium" style={{ color: "var(--text-strong)" }}>
            {session()?.title || "New Session"}
          </h1>
          <Show when={session()}>
            <p class="text-xs" style={{ color: "var(--text-weak)" }}>
              {session()?.id}
            </p>
          </Show>
        </div>

        {/* Model & Agent Selectors */}
        <div class="flex items-center gap-4">
          {/* Agent Selector */}
          <div class="relative" ref={agentPickerRef}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowAgentPicker(!showAgentPicker())
                setShowModelPicker(false)
              }}
              class="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors"
              style={{
                border: "1px solid var(--border-base)",
                color: "var(--text-base)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-inset)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span class="capitalize">{providers.selectedAgent}</span>
              <svg
                class="w-4 h-4"
                style={{ color: "var(--icon-weak)" }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <Show when={showAgentPicker()}>
              <div
                class="absolute right-0 top-full mt-1 w-48 rounded-lg shadow-lg z-10 overflow-hidden"
                style={{
                  background: "var(--background-base)",
                  border: "1px solid var(--border-base)",
                }}
              >
                <For each={providers.agents}>
                  {(agent) => (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        providers.setSelectedAgent(agent.name)
                        setShowAgentPicker(false)
                      }}
                      class="w-full px-3 py-2 text-left text-sm transition-colors"
                      style={{
                        color:
                          providers.selectedAgent === agent.name ? "var(--text-interactive-base)" : "var(--text-base)",
                        background: providers.selectedAgent === agent.name ? "var(--surface-inset)" : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (providers.selectedAgent !== agent.name)
                          e.currentTarget.style.background = "var(--surface-inset)"
                      }}
                      onMouseLeave={(e) => {
                        if (providers.selectedAgent !== agent.name) e.currentTarget.style.background = "transparent"
                      }}
                    >
                      <span class="capitalize">{agent.name}</span>
                    </button>
                  )}
                </For>
                <Show when={providers.agents.length === 0}>
                  <div class="px-3 py-2 text-sm" style={{ color: "var(--text-weak)" }}>
                    No agents available
                  </div>
                </Show>
              </div>
            </Show>
          </div>

          {/* Model Selector */}
          <div class="relative" ref={modelPickerRef}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowModelPicker(!showModelPicker())
                setShowAgentPicker(false)
              }}
              class="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors"
              style={{
                border: "1px solid var(--border-base)",
                color: "var(--text-base)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-inset)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span>
                {providers.selectedModel
                  ? `${providers.selectedModel.providerID}/${providers.selectedModel.modelID}`
                  : "Select model"}
              </span>
              <svg
                class="w-4 h-4"
                style={{ color: "var(--icon-weak)" }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <Show when={showModelPicker()}>
              <div
                class="absolute right-0 top-full mt-1 w-72 max-h-96 overflow-y-auto rounded-lg shadow-lg z-10"
                style={{
                  background: "var(--background-base)",
                  border: "1px solid var(--border-base)",
                }}
              >
                <Show when={providers.connected.length === 0}>
                  <div class="px-3 py-4 text-sm text-center" style={{ color: "var(--text-weak)" }}>
                    <p>No providers connected.</p>
                    <a
                      href={`/${dirSlug()}/settings`}
                      style={{ color: "var(--text-interactive-base)" }}
                      class="hover:underline"
                    >
                      Connect a provider
                    </a>
                  </div>
                </Show>

                <For each={providers.providers.filter((p) => providers.connected.includes(p.id))}>
                  {(provider) => (
                    <div>
                      <div
                        class="px-3 py-2 text-xs font-medium"
                        style={{
                          color: "var(--text-weak)",
                          background: "var(--surface-inset)",
                          "border-bottom": "1px solid var(--border-base)",
                        }}
                      >
                        {provider.name}
                      </div>
                      <For each={Object.values(provider.models).slice(0, 10)}>
                        {(model) => {
                          const selected =
                            providers.selectedModel?.providerID === provider.id &&
                            providers.selectedModel?.modelID === model.id
                          return (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                providers.setSelectedModel({ providerID: provider.id, modelID: model.id })
                                setShowModelPicker(false)
                              }}
                              class="w-full px-3 py-2 text-left text-sm transition-colors"
                              style={{
                                color: selected ? "var(--text-interactive-base)" : "var(--text-base)",
                                background: selected ? "var(--surface-inset)" : "transparent",
                              }}
                              onMouseEnter={(e) => {
                                if (!selected) e.currentTarget.style.background = "var(--surface-inset)"
                              }}
                              onMouseLeave={(e) => {
                                if (!selected) e.currentTarget.style.background = "transparent"
                              }}
                            >
                              {model.name}
                            </button>
                          )
                        }}
                      </For>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>

          <Show when={processing()}>
            <div class="flex items-center gap-2 text-sm" style={{ color: "var(--text-interactive-base)" }}>
              <Spinner class="w-4 h-4" />
              Processing...
            </div>
          </Show>
        </div>
      </header>

      {/* Messages */}
      <div class="flex-1 overflow-y-auto p-6 space-y-4" style={{ background: "var(--background-stronger)" }}>
        <Show when={messages().length === 0 && !loading()}>
          <div class="flex flex-col items-center justify-center h-full text-center">
            <div
              class="w-16 h-16 rounded-full flex items-center justify-center mb-4"
              style={{ background: "var(--surface-inset)" }}
            >
              <svg
                class="w-8 h-8"
                style={{ color: "var(--text-interactive-base)" }}
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
            </div>
            <h3 class="text-lg font-medium mb-2" style={{ color: "var(--text-strong)" }}>
              Start a conversation
            </h3>
            <p style={{ color: "var(--text-weak)" }}>Type a message below to begin</p>
          </div>
        </Show>

        <For each={messages()}>
          {(message) => (
            <div
              class="max-w-3xl"
              classList={{
                "ml-auto": message.role === "user",
              }}
            >
              <div
                class="rounded-lg p-4"
                style={{
                  background: message.role === "user" ? "var(--surface-inset)" : "var(--background-base)",
                  border: `1px solid var(--border-base)`,
                }}
              >
                <div class="text-xs font-medium mb-2 uppercase tracking-wide" style={{ color: "var(--text-weak)" }}>
                  {message.role}
                </div>
                <Show
                  when={message.role === "assistant"}
                  fallback={
                    <div class="whitespace-pre-wrap" style={{ color: "var(--text-base)" }}>
                      {extractTextContent(message.parts) || "..."}
                    </div>
                  }
                >
                  <Markdown content={extractTextContent(message.parts) || "..."} class="text-gray-800" />
                </Show>
              </div>
            </div>
          )}
        </For>

        <Show when={processing()}>
          <div class="max-w-3xl">
            <div
              class="rounded-lg p-4"
              style={{
                background: "var(--background-base)",
                border: "1px solid var(--border-base)",
              }}
            >
              <div class="flex items-center gap-2" style={{ color: "var(--text-weak)" }}>
                <Spinner class="w-4 h-4" />
                <span>Thinking...</span>
              </div>
            </div>
          </div>
        </Show>

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div class="p-4" style={{ background: "var(--background-base)", "border-top": "1px solid var(--border-base)" }}>
        <div class="relative max-w-3xl mx-auto">
          {/* Slash Command Popover */}
          <Show when={showSlashPopover() && filteredSlashCommands().length > 0}>
            <div
              ref={slashPopoverRef}
              class="absolute bottom-full left-0 mb-2 w-72 rounded-lg shadow-lg z-20 overflow-hidden"
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
                Commands
              </div>
              <For each={filteredSlashCommands()}>
                {(cmd, idx) => (
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      selectSlashCommand(cmd)
                    }}
                    class="w-full px-3 py-2 text-left text-sm flex items-start gap-3 transition-colors"
                    style={{
                      background: idx() === slashIndex() ? "var(--surface-inset)" : "transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (idx() !== slashIndex()) e.currentTarget.style.background = "var(--surface-inset)"
                    }}
                    onMouseLeave={(e) => {
                      if (idx() !== slashIndex()) e.currentTarget.style.background = "transparent"
                    }}
                  >
                    <span class="font-mono" style={{ color: "var(--text-interactive-base)" }}>
                      /{cmd.slash}
                    </span>
                    <div class="flex-1">
                      <div class="font-medium" style={{ color: "var(--text-strong)" }}>
                        {cmd.title}
                      </div>
                      <Show when={cmd.description}>
                        <div class="text-xs" style={{ color: "var(--text-weak)" }}>
                          {cmd.description}
                        </div>
                      </Show>
                    </div>
                  </button>
                )}
              </For>
            </div>
          </Show>

          <form onSubmit={sendMessage} class="flex gap-3">
            <div class="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={input()}
                onInput={(e) => handleInputChange(e.currentTarget.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Type a message or / for commands..."
                class="w-full px-4 py-3 rounded-lg focus:ring-2 focus:outline-none"
                style={
                  {
                    background: "var(--background-base)",
                    border: "1px solid var(--border-base)",
                    color: "var(--text-base)",
                    "--tw-ring-color": "var(--interactive-base)",
                  } as any
                }
                disabled={loading() || processing()}
              />
              {/* Hint for slash commands */}
              <Show when={!input() && !loading() && !processing()}>
                <div class="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: "var(--text-weak)" }}>
                  Type{" "}
                  <span class="font-mono px-1 rounded" style={{ background: "var(--surface-inset)" }}>
                    /
                  </span>{" "}
                  for commands
                </div>
              </Show>
            </div>
            <Button type="submit" disabled={loading() || processing() || !input().trim() || showSlashPopover()}>
              <Show when={loading()} fallback="Send">
                <Spinner class="w-4 h-4" />
              </Show>
            </Button>
          </form>

          {/* Current model/agent indicator */}
          <div class="flex items-center gap-4 mt-2 text-xs" style={{ color: "var(--text-weak)" }}>
            <Show when={providers.selectedAgent}>
              <span>
                Agent:{" "}
                <span class="font-medium capitalize" style={{ color: "var(--text-base)" }}>
                  {providers.selectedAgent}
                </span>
              </span>
            </Show>
            <Show when={providers.selectedModel}>
              {(model) => (
                <span>
                  Model:{" "}
                  <span class="font-medium" style={{ color: "var(--text-base)" }}>
                    {model().providerID}/{model().modelID}
                  </span>
                </span>
              )}
            </Show>
            <Show when={!providers.selectedModel && providers.connected.length === 0}>
              <a
                href={`/${dirSlug()}/settings`}
                style={{ color: "var(--text-interactive-base)" }}
                class="hover:underline"
              >
                Connect a provider to start
              </a>
            </Show>
          </div>
        </div>
      </div>
    </div>
  )
}
