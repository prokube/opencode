import { createContext, useContext, createResource, createEffect, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { useSDK } from "./sdk"

// Default model to use
const DEFAULT_PROVIDER = "opencode"
const DEFAULT_MODEL = "big-pickle"
const DEFAULT_AGENT = "build"

// Define types locally to avoid SDK type mismatches
interface Model {
  id: string
  name: string
  providerID: string
}

interface Provider {
  id: string
  name: string
  models: Record<string, Model>
}

interface Agent {
  name: string
  mode: string
  hidden?: boolean
}

interface ProviderAuthMethod {
  type: "api" | "oauth"
  label: string
}

interface ModelKey {
  providerID: string
  modelID: string
}

interface ProviderListData {
  all: Provider[]
  connected: string[]
  default: Record<string, string>
}

interface OAuthAuthorization {
  url: string
  method: "auto" | "code"
  instructions: string
}

interface ProviderContextValue {
  providers: Provider[]
  connected: string[]
  defaults: Record<string, string>
  authMethods: Record<string, ProviderAuthMethod[]>
  agents: Agent[]
  loading: boolean
  selectedModel: ModelKey | null
  selectedAgent: string
  setSelectedModel: (model: ModelKey | null) => void
  setSelectedAgent: (agent: string) => void
  refetch: () => void
  connectProvider: (providerID: string, apiKey: string) => Promise<boolean>
  startOAuth: (providerID: string, methodIndex: number) => Promise<OAuthAuthorization | undefined>
  completeOAuth: (providerID: string, methodIndex: number, code?: string) => Promise<boolean>
}

const ProviderContext = createContext<ProviderContextValue>()

export function ProviderProvider(props: ParentProps) {
  const { client } = useSDK()

  const [store, setStore] = createStore({
    selectedModel: null as ModelKey | null,
    selectedAgent: DEFAULT_AGENT,
  })

  // Fetch providers
  const [providerData, { refetch: refetchProviders }] = createResource(async () => {
    try {
      const res = await client.provider.list()
      return res.data as ProviderListData | undefined
    } catch (e) {
      console.error("Failed to fetch providers:", e)
      return undefined
    }
  })

  // Auto-select default model when provider data loads
  createEffect(() => {
    const data = providerData()
    if (!data || store.selectedModel) return

    // Check if default provider is connected
    if (data.connected.includes(DEFAULT_PROVIDER)) {
      const provider = data.all.find((p) => p.id === DEFAULT_PROVIDER)
      if (provider && provider.models[DEFAULT_MODEL]) {
        console.log("[Providers] Auto-selecting default model:", DEFAULT_PROVIDER, DEFAULT_MODEL)
        setStore("selectedModel", { providerID: DEFAULT_PROVIDER, modelID: DEFAULT_MODEL })
      }
    }
  })

  // Fetch auth methods for all providers (returns { [providerID]: ProviderAuthMethod[] })
  const [authData] = createResource(async () => {
    try {
      const res = await client.provider.auth()
      return (res.data as Record<string, ProviderAuthMethod[]>) ?? {}
    } catch (e) {
      console.error("Failed to fetch auth methods:", e)
      return {}
    }
  })

  // Fetch agents
  const [agentsData, { refetch: refetchAgents }] = createResource(async () => {
    try {
      const res = await client.app.agents()
      console.log("[Providers] Agents response:", res)
      console.log("[Providers] Agents data:", res.data)

      // The API returns an array directly, SDK wraps it in { data: [...] }
      const agents = res.data
      if (!Array.isArray(agents)) {
        console.error("[Providers] Agents is not an array:", agents)
        return []
      }
      return agents as Agent[]
    } catch (e) {
      console.error("Failed to fetch agents:", e)
      return []
    }
  })

  function setSelectedModel(model: ModelKey | null) {
    setStore("selectedModel", model)
  }

  function setSelectedAgent(agent: string) {
    setStore("selectedAgent", agent)
  }

  async function connectProvider(providerID: string, apiKey: string): Promise<boolean> {
    try {
      await client.auth.set({
        providerID,
        auth: { type: "api", key: apiKey },
      })
      // Dispose instance to reload provider state, then refresh
      await client.instance.dispose()
      await refetchProviders()
      return true
    } catch (e) {
      console.error("Failed to connect provider:", e)
      return false
    }
  }

  async function startOAuth(providerID: string, methodIndex: number): Promise<OAuthAuthorization | undefined> {
    try {
      const res = await client.provider.oauth.authorize({
        providerID,
        method: methodIndex,
      })
      return res.data as OAuthAuthorization | undefined
    } catch (e) {
      console.error("Failed to start OAuth:", e)
      return undefined
    }
  }

  async function completeOAuth(providerID: string, methodIndex: number, code?: string): Promise<boolean> {
    try {
      await client.provider.oauth.callback({
        providerID,
        method: methodIndex,
        code,
      })
      // Dispose instance to reload provider state, then refresh
      await client.instance.dispose()
      await refetchProviders()
      console.log("[Providers] Refetched after OAuth, connected:", providerData()?.connected)
      return true
    } catch (e) {
      console.error("Failed to complete OAuth:", e)
      return false
    }
  }

  function refetch() {
    refetchProviders()
    refetchAgents()
  }

  const value: ProviderContextValue = {
    get providers() {
      return providerData()?.all ?? []
    },
    get connected() {
      return providerData()?.connected ?? []
    },
    get defaults() {
      return providerData()?.default ?? {}
    },
    get authMethods() {
      return authData() ?? {}
    },
    get agents() {
      // Filter to show only useful agents: build, general, explore
      const allowedAgents = ["build", "general", "explore"]
      return (agentsData() ?? []).filter((a) => allowedAgents.includes(a.name) && !a.hidden)
    },
    get loading() {
      return providerData.loading || agentsData.loading
    },
    get selectedModel() {
      return store.selectedModel
    },
    get selectedAgent() {
      return store.selectedAgent
    },
    setSelectedModel,
    setSelectedAgent,
    refetch,
    connectProvider,
    startOAuth,
    completeOAuth,
  }

  return <ProviderContext.Provider value={value}>{props.children}</ProviderContext.Provider>
}

export function useProviders() {
  const ctx = useContext(ProviderContext)
  if (!ctx) throw new Error("useProviders must be used within ProviderProvider")
  return ctx
}
