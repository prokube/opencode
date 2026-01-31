import { createContext, useContext, createSignal, onMount, type ParentProps, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { useSDK } from "./sdk"
import { useEvents } from "./events"

// MCP Status types matching the backend
type MCPStatus =
  | { status: "connected" }
  | { status: "disabled" }
  | { status: "failed"; error: string }
  | { status: "needs_auth" }
  | { status: "needs_client_registration"; error: string }

// MCP Config types - exported for use in components
export interface McpLocalConfig {
  type: "local"
  command: string[]
  environment?: Record<string, string>
  enabled?: boolean
  timeout?: number
}

export interface McpOAuthConfig {
  clientId?: string
  clientSecret?: string
  scope?: string
}

export interface McpRemoteConfig {
  type: "remote"
  url: string
  headers?: Record<string, string>
  oauth?: McpOAuthConfig | false
  enabled?: boolean
  timeout?: number
}

export type McpConfig = McpLocalConfig | McpRemoteConfig

interface MCPContextValue {
  servers: Record<string, MCPStatus>
  loading: () => boolean
  refresh: () => Promise<void>
  connect: (name: string) => Promise<void>
  disconnect: (name: string) => Promise<void>
  add: (name: string, config: McpConfig) => Promise<void>
  remove: (name: string) => Promise<void>
  startAuth: (name: string) => Promise<{ authorizationUrl: string } | null>
  stats: () => { enabled: number; failed: boolean; total: number }
}

const MCPContext = createContext<MCPContextValue>()

export function MCPProvider(props: ParentProps) {
  const { client } = useSDK()
  const events = useEvents()
  const [servers, setServers] = createStore<Record<string, MCPStatus>>({})
  const [loading, setLoading] = createSignal(true)

  async function refresh() {
    try {
      const res = await client.mcp.status()
      if (res.data) {
        setServers(res.data as Record<string, MCPStatus>)
      }
    } catch (e) {
      console.error("[MCP] Failed to fetch status:", e)
    } finally {
      setLoading(false)
    }
  }

  async function connect(name: string) {
    try {
      await client.mcp.connect({ name })
      await refresh()
    } catch (e) {
      console.error("[MCP] Failed to connect:", name, e)
    }
  }

  async function disconnect(name: string) {
    try {
      await client.mcp.disconnect({ name })
      await refresh()
    } catch (e) {
      console.error("[MCP] Failed to disconnect:", name, e)
    }
  }

  async function add(name: string, mcpConfig: McpConfig) {
    try {
      console.log("[MCP] Adding server:", name, mcpConfig)

      // First, persist the MCP config to the global config file
      // This is necessary because mcp.status() reads from the config file
      const currentConfig = await client.global.config.get()
      const existingMcp = (currentConfig.data?.mcp as Record<string, McpConfig> | undefined) || {}
      await client.global.config.update({
        config: {
          mcp: {
            ...existingMcp,
            [name]: mcpConfig,
          },
        },
      })
      console.log("[MCP] Config persisted to global config")

      // Now call mcp.add to connect the server
      const response = await client.mcp.add({ name, config: mcpConfig })
      console.log("[MCP] Add server response:", response)
      await refresh()

      // Check if the server actually connected successfully
      const s = await client.mcp.status()
      const status = s.data?.[name]
      console.log("[MCP] Server status after add:", status)

      if (status?.status === "failed") {
        throw new Error(`Failed to connect: ${status.error}`)
      }
      if (status?.status === "needs_auth") {
        throw new Error("Server requires OAuth authentication. Please configure OAuth settings.")
      }
      if (status?.status === "needs_client_registration") {
        throw new Error(status.error || "Server requires OAuth client registration")
      }
    } catch (e) {
      console.error("[MCP] Failed to add server:", name, e)
      throw e
    }
  }

  async function remove(name: string) {
    try {
      console.log("[MCP] Removing server:", name)

      // First disconnect if connected
      await client.mcp.disconnect({ name }).catch(() => {
        // Ignore disconnect errors - server might not be connected
      })

      // Remove from global config
      const currentConfig = await client.global.config.get()
      const existingMcp = (currentConfig.data?.mcp as Record<string, McpConfig> | undefined) || {}

      // Create new config without the removed server
      const { [name]: removed, ...remainingMcp } = existingMcp

      await client.global.config.update({
        config: {
          mcp: remainingMcp,
        },
      })
      console.log("[MCP] Server removed from global config")

      await refresh()
    } catch (e) {
      console.error("[MCP] Failed to remove server:", name, e)
      throw e
    }
  }

  async function startAuth(name: string): Promise<{ authorizationUrl: string } | null> {
    try {
      const res = await client.mcp.auth.start({ name })
      return res.data as { authorizationUrl: string } | null
    } catch (e) {
      console.error("[MCP] Failed to start auth:", name, e)
      return null
    }
  }

  const stats = createMemo(() => {
    const entries = Object.entries(servers)
    const enabled = entries.filter(([, s]) => s.status === "connected").length
    const failed = entries.some(([, s]) => s.status === "failed")
    const total = entries.length
    return { enabled, failed, total }
  })

  onMount(() => {
    refresh()

    // Listen for MCP-related events and server restarts
    const unsub = events.subscribe((event) => {
      // Refresh on any mcp-related event type
      if (event.type.startsWith("mcp.")) {
        refresh()
      }
      // Also refresh when server reconnects (after config change causes restart)
      if (event.type === "server.connected") {
        refresh()
      }
    })

    return unsub
  })

  return (
    <MCPContext.Provider
      value={{
        servers,
        loading,
        refresh,
        connect,
        disconnect,
        add,
        remove,
        startAuth,
        stats,
      }}
    >
      {props.children}
    </MCPContext.Provider>
  )
}

export function useMCP() {
  const ctx = useContext(MCPContext)
  if (!ctx) throw new Error("useMCP must be used within MCPProvider")
  return ctx
}
