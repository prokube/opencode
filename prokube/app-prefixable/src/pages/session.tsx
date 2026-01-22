import { createSignal, createResource, Show, For, onMount, createEffect } from "solid-js"
import { useParams, useNavigate } from "@solidjs/router"
import { Button } from "@opencode-ai/ui/button"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useSDK } from "../context/sdk"
import { useEvents } from "../context/events"
import { Markdown } from "../components/markdown"
import type { Part } from "@opencode-ai/sdk/v2/client"

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
  const params = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const { client } = useSDK()
  const events = useEvents()

  const [input, setInput] = createSignal("")
  const [messages, setMessages] = createSignal<DisplayMessage[]>([])
  const [loading, setLoading] = createSignal(false)
  const [processing, setProcessing] = createSignal(false)
  const [sessionId, setSessionId] = createSignal(params.id)
  let messagesEndRef: HTMLDivElement | undefined
  let inputRef: HTMLInputElement | undefined

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
        navigate(`/session/${id}`, { replace: true })
      }

      // Send message
      console.log("[Session] Sending message to session:", id)
      const promptRes = await client.session.promptAsync({
        sessionID: id,
        parts: [{ type: "text", text }],
      })
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
      <header class="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
        <div>
          <h1 class="text-lg font-semibold text-gray-900">{session()?.title || "New Session"}</h1>
          <Show when={session()}>
            <p class="text-sm text-gray-500">{session()?.id}</p>
          </Show>
        </div>
        <Show when={processing()}>
          <div class="flex items-center gap-2 text-sm text-purple-600">
            <Spinner class="w-4 h-4" />
            Processing...
          </div>
        </Show>
      </header>

      {/* Messages */}
      <div class="flex-1 overflow-y-auto p-6 space-y-4">
        <Show when={messages().length === 0 && !loading()}>
          <div class="flex flex-col items-center justify-center h-full text-center">
            <div class="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4">
              <svg class="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <h3 class="text-lg font-medium text-gray-900 mb-2">Start a conversation</h3>
            <p class="text-gray-500">Type a message below to begin</p>
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
                classList={{
                  "bg-purple-50 border border-purple-100": message.role === "user",
                  "bg-white border border-gray-200 shadow-sm": message.role === "assistant",
                }}
              >
                <div class="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">{message.role}</div>
                <Show
                  when={message.role === "assistant"}
                  fallback={
                    <div class="text-gray-800 whitespace-pre-wrap">{extractTextContent(message.parts) || "..."}</div>
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
            <div class="rounded-lg p-4 bg-white border border-gray-200 shadow-sm">
              <div class="flex items-center gap-2 text-gray-500">
                <Spinner class="w-4 h-4" />
                <span>Thinking...</span>
              </div>
            </div>
          </div>
        </Show>

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div class="p-4 border-t border-gray-200 bg-white">
        <form onSubmit={sendMessage} class="flex gap-3 max-w-3xl mx-auto">
          <input
            ref={inputRef}
            type="text"
            value={input()}
            onInput={(e) => setInput(e.currentTarget.value)}
            placeholder="Type a message..."
            class="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 focus:outline-none"
            disabled={loading() || processing()}
          />
          <Button type="submit" disabled={loading() || processing() || !input().trim()}>
            <Show when={loading()} fallback="Send">
              <Spinner class="w-4 h-4" />
            </Show>
          </Button>
        </form>
      </div>
    </div>
  )
}
