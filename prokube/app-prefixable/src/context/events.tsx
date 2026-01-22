import { createContext, useContext, onCleanup, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import type { Event, SessionStatus } from "@opencode-ai/sdk/v2/client"

type EventHandler = (event: Event) => void

interface EventContextValue {
  subscribe: (handler: EventHandler) => () => void
  status: Record<string, SessionStatus>
}

const EventContext = createContext<EventContextValue>()

export function EventProvider(props: ParentProps) {
  const handlers = new Set<EventHandler>()
  const [status, setStatus] = createStore<Record<string, SessionStatus>>({})

  // Connect to SSE endpoint - use relative URL so it goes through the proxy
  let eventSource: EventSource | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  function connect() {
    if (eventSource) return

    // Use relative path - the dev server will proxy this
    eventSource = new EventSource("/event")
    console.log("[Events] Connecting to SSE...")

    eventSource.onopen = () => {
      console.log("[Events] Connected")
    }

    eventSource.onmessage = (e) => {
      try {
        const wrapper = JSON.parse(e.data) as { directory?: string; payload: Event }
        const event = wrapper.payload
        console.log("[Events] Received:", event.type)

        // Update session status
        if (event.type === "session.status") {
          const sessionID = event.properties.sessionID
          setStatus(sessionID, event.properties.status)
        }

        // Notify all handlers
        for (const handler of handlers) {
          handler(event)
        }
      } catch (err) {
        console.error("[Events] Parse error:", err)
      }
    }

    eventSource.onerror = (e) => {
      console.error("[Events] Connection error, reconnecting...", e)
      eventSource?.close()
      eventSource = null

      // Reconnect after delay
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null
          connect()
        }, 3000)
      }
    }
  }

  // Start connection
  connect()

  onCleanup(() => {
    eventSource?.close()
    if (reconnectTimer) clearTimeout(reconnectTimer)
  })

  function subscribe(handler: EventHandler) {
    handlers.add(handler)
    return () => handlers.delete(handler)
  }

  return <EventContext.Provider value={{ subscribe, status }}>{props.children}</EventContext.Provider>
}

export function useEvents() {
  const ctx = useContext(EventContext)
  if (!ctx) throw new Error("useEvents must be used within EventProvider")
  return ctx
}
