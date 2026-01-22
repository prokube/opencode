import { createSignal, createResource, Show, For, onMount, createEffect, onCleanup, createMemo } from "solid-js"
import { useParams, useNavigate } from "@solidjs/router"
import { Button } from "@opencode-ai/ui/button"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useSDK } from "../context/sdk"
import { useEvents } from "../context/events"
import { useProviders } from "../context/providers"
import { useMCP } from "../context/mcp"
import { Markdown } from "../components/markdown"
import { MCPDialog } from "../components/mcp-dialog"
import { MCPAddDialog } from "../components/mcp-add-dialog"
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
  const mcp = useMCP()

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
  const [showMCPDialog, setShowMCPDialog] = createSignal(false)
  const [showMCPAddDialog, setShowMCPAddDialog] = createSignal(false)
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
    {
      id: "mcp.manage",
      title: "MCP Servers",
      description: "Manage MCP server connections",
      slash: "mcp",
      onSelect: () => {
        console.log("[Command] MCP dialog")
        setShowMCPDialog(true)
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

  // If no session ID, show welcome screen
  if (!params.id) {
    return (
      <div class="flex flex-col h-full" style={{ background: "var(--background-stronger)" }}>
        <div class="flex flex-col items-center justify-center flex-1 text-center px-6">
          {/* OpenCode Logo */}
          <div class="mb-8">
            <svg
              class="w-80 mx-auto opacity-60"
              style={{ color: "var(--text-strong)" }}
              viewBox="0 0 640 115"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <g clip-path="url(#clip0_welcome)">
                <mask
                  id="mask0_welcome"
                  style="mask-type:luminance"
                  maskUnits="userSpaceOnUse"
                  x="0"
                  y="0"
                  width="640"
                  height="115"
                >
                  <path d="M640 0H0V115H640V0Z" fill="white" />
                </mask>
                <g mask="url(#mask0_welcome)">
                  <path d="M49.2346 82.1433H16.4141V49.2861H49.2346V82.1433Z" fill="#CFCECD" />
                  <path
                    d="M49.2308 32.8573H16.4103V82.143H49.2308V32.8573ZM65.641 98.5716H0V16.4287H65.641V98.5716Z"
                    fill="#656363"
                  />
                  <path d="M131.281 82.1433H98.4609V49.2861H131.281V82.1433Z" fill="#CFCECD" />
                  <path
                    d="M98.4649 82.143H131.285V32.8573H98.4649V82.143ZM147.696 98.5716H98.4649V115H82.0547V16.4287H147.696V98.5716Z"
                    fill="#656363"
                  />
                  <path d="M229.746 65.7139V82.1424H180.516V65.7139H229.746Z" fill="#CFCECD" />
                  <path
                    d="M229.743 65.7144H180.512V82.143H229.743V98.5716H164.102V16.4287H229.743V65.7144ZM180.512 49.2859H213.332V32.8573H180.512V49.2859Z"
                    fill="#656363"
                  />
                  <path d="M295.383 98.5718H262.562V49.2861H295.383V98.5718Z" fill="#CFCECD" />
                  <path
                    d="M295.387 32.8573H262.567V98.5716H246.156V16.4287H295.387V32.8573ZM311.797 98.5716H295.387V32.8573H311.797V98.5716Z"
                    fill="#656363"
                  />
                  <path d="M393.848 82.1433H344.617V49.2861H393.848V82.1433Z" fill="#CFCECD" />
                  <path
                    d="M393.844 32.8573H344.613V82.143H393.844V98.5716H328.203V16.4287H393.844V32.8573Z"
                    fill="currentColor"
                  />
                  <path d="M459.485 82.1433H426.664V49.2861H459.485V82.1433Z" fill="#CFCECD" />
                  <path
                    d="M459.489 32.8573H426.668V82.143H459.489V32.8573ZM475.899 98.5716H410.258V16.4287H475.899V98.5716Z"
                    fill="currentColor"
                  />
                  <path d="M541.539 82.1433H508.719V49.2861H541.539V82.1433Z" fill="#CFCECD" />
                  <path
                    d="M541.535 32.8571H508.715V82.1428H541.535V32.8571ZM557.946 98.5714H492.305V16.4286H541.535V0H557.946V98.5714Z"
                    fill="currentColor"
                  />
                  <path d="M639.996 65.7139V82.1424H590.766V65.7139H639.996Z" fill="#CFCECD" />
                  <path
                    d="M590.77 32.8573V49.2859H623.59V32.8573H590.77ZM640 65.7144H590.77V82.143H640V98.5716H574.359V16.4287H640V65.7144Z"
                    fill="currentColor"
                  />
                </g>
              </g>
              <defs>
                <clipPath id="clip0_welcome">
                  <rect width="640" height="115" fill="white" />
                </clipPath>
              </defs>
            </svg>
          </div>

          <p class="text-lg mb-8" style={{ color: "var(--text-weak)" }}>
            AI-powered coding assistant
          </p>

          {/* Action buttons */}
          <div class="flex flex-col gap-3 w-full max-w-xs">
            <Button
              onClick={async () => {
                console.log("[Welcome] New Session clicked, directory:", directory, "dirSlug:", dirSlug())
                if (!directory) {
                  console.error("[Welcome] No directory available")
                  return
                }
                try {
                  console.log("[Welcome] Creating session...")
                  const res = await client.session.create({})
                  console.log("[Welcome] Create response:", res)
                  if (res.data) {
                    const url = `/${dirSlug()}/session/${res.data.id}`
                    console.log("[Welcome] Navigating to:", url)
                    navigate(url)
                  }
                } catch (e) {
                  console.error("[Welcome] Failed to create session:", e)
                }
              }}
              variant="primary"
              class="w-full justify-center"
            >
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              New Session
            </Button>

            <Button
              onClick={() => navigate(`/${dirSlug()}/settings`)}
              variant="secondary"
              class="w-full justify-center"
            >
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            </Button>
          </div>

          <p class="mt-10 text-sm" style={{ color: "var(--text-weak)", opacity: 0.7 }}>
            Select a session from the sidebar or start a new one
          </p>
        </div>
      </div>
    )
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

          {/* MCP Indicator */}
          <Show when={mcp.stats().total > 0}>
            <button
              onClick={() => setShowMCPDialog(true)}
              class="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors"
              style={{
                border: "1px solid var(--border-base)",
                color: "var(--text-base)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-inset)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div
                class="w-2 h-2 rounded-full"
                style={{
                  background: mcp.stats().failed
                    ? "var(--icon-critical-base)"
                    : mcp.stats().enabled > 0
                      ? "var(--icon-success-base)"
                      : "var(--icon-weak)",
                }}
              />
              <span>{mcp.stats().enabled} MCP</span>
            </button>
          </Show>

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
            <p class="text-lg mb-2" style={{ color: "var(--text-weak)" }}>
              Ready to chat
            </p>
            <p style={{ color: "var(--text-weak)", opacity: 0.7 }}>Type a message below to begin</p>
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

      {/* MCP Dialogs */}
      <Show when={showMCPDialog()}>
        <MCPDialog
          onClose={() => setShowMCPDialog(false)}
          onAddServer={() => {
            setShowMCPDialog(false)
            setShowMCPAddDialog(true)
          }}
        />
      </Show>

      <Show when={showMCPAddDialog()}>
        <MCPAddDialog
          onClose={() => setShowMCPAddDialog(false)}
          onBack={() => {
            setShowMCPAddDialog(false)
            setShowMCPDialog(true)
          }}
        />
      </Show>
    </div>
  )
}
