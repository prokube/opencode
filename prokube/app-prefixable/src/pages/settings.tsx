import { createSignal, For, Show } from "solid-js"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useProviders } from "../context/providers"
import { useMCP } from "../context/mcp"
import { MCPAddDialog } from "../components/mcp-add-dialog"

export function Settings() {
  const providers = useProviders()
  const mcp = useMCP()
  const [selectedProvider, setSelectedProvider] = createSignal<string | null>(null)
  const [apiKey, setApiKey] = createSignal("")
  const [connecting, setConnecting] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [success, setSuccess] = createSignal<string | null>(null)
  const [activeTab, setActiveTab] = createSignal("providers")
  const [showMCPAddDialog, setShowMCPAddDialog] = createSignal(false)
  const [mcpLoading, setMcpLoading] = createSignal<string | null>(null)

  async function handleConnect(e: SubmitEvent) {
    e.preventDefault()
    const providerID = selectedProvider()
    const key = apiKey().trim()

    if (!providerID || !key) return

    setConnecting(true)
    setError(null)
    setSuccess(null)

    const ok = await providers.connectProvider(providerID, key)

    setConnecting(false)

    if (ok) {
      setSuccess(`Connected to ${providerID}!`)
      setApiKey("")
      setSelectedProvider(null)
    } else {
      setError("Failed to connect. Please check your API key.")
    }
  }

  function getProviderDisplayName(id: string): string {
    const provider = providers.providers.find((p) => p.id === id)
    return provider?.name ?? id
  }

  const tabs = [
    { id: "providers", label: "Providers" },
    { id: "mcp", label: "MCP Servers" },
    { id: "models", label: "Models" },
    { id: "agents", label: "Agents" },
  ]

  return (
    <div class="h-full flex" style={{ background: "var(--background-stronger)" }}>
      {/* Tabs sidebar */}
      <div
        class="w-48 shrink-0 flex flex-col py-3 px-2"
        style={{
          background: "var(--background-base)",
          "border-right": "1px solid var(--border-base)",
        }}
      >
        <div class="text-xs font-medium uppercase tracking-wide px-3 py-2" style={{ color: "var(--text-weak)" }}>
          Settings
        </div>
        <div class="space-y-0.5">
          <For each={tabs}>
            {(tab) => (
              <button
                onClick={() => setActiveTab(tab.id)}
                class="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left"
                style={{
                  color: activeTab() === tab.id ? "var(--text-interactive-base)" : "var(--text-base)",
                  background: activeTab() === tab.id ? "var(--surface-inset)" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (activeTab() !== tab.id) e.currentTarget.style.background = "var(--surface-inset)"
                }}
                onMouseLeave={(e) => {
                  if (activeTab() !== tab.id) e.currentTarget.style.background = "transparent"
                }}
              >
                {tab.label}
              </button>
            )}
          </For>
        </div>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-y-auto">
        <div class="max-w-2xl p-6 space-y-6">
          {/* Providers Tab */}
          <Show when={activeTab() === "providers"}>
            <div class="space-y-6">
              <header>
                <h1 class="text-lg font-medium" style={{ color: "var(--text-strong)" }}>
                  Providers
                </h1>
                <p class="text-sm mt-1" style={{ color: "var(--text-weak)" }}>
                  Connect AI providers to enable chat functionality
                </p>
              </header>

              {/* Connected Providers */}
              <section
                class="rounded-lg overflow-hidden"
                style={{
                  background: "var(--background-base)",
                  border: "1px solid var(--border-base)",
                }}
              >
                <div class="px-4 py-3" style={{ "border-bottom": "1px solid var(--border-base)" }}>
                  <h2 class="text-sm font-medium" style={{ color: "var(--text-strong)" }}>
                    Connected Providers
                  </h2>
                </div>
                <div class="p-4">
                  <Show when={providers.loading}>
                    <div class="flex items-center gap-2" style={{ color: "var(--text-weak)" }}>
                      <Spinner class="w-4 h-4" />
                      <span class="text-sm">Loading...</span>
                    </div>
                  </Show>

                  <Show when={!providers.loading && providers.connected.length === 0}>
                    <p class="text-sm" style={{ color: "var(--text-weak)" }}>
                      No providers connected yet.
                    </p>
                  </Show>

                  <Show when={!providers.loading && providers.connected.length > 0}>
                    <div class="space-y-2">
                      <For each={providers.connected}>
                        {(providerID) => (
                          <div
                            class="flex items-center justify-between p-3 rounded-md"
                            style={{ background: "var(--surface-inset)" }}
                          >
                            <div class="flex items-center gap-3">
                              <div class="w-6 h-6 bg-green-100 rounded flex items-center justify-center">
                                <svg
                                  class="w-3 h-3 text-green-600"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              </div>
                              <span class="text-sm font-medium" style={{ color: "var(--text-strong)" }}>
                                {getProviderDisplayName(providerID)}
                              </span>
                            </div>
                            <span class="text-xs" style={{ color: "var(--text-weak)" }}>
                              Connected
                            </span>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </section>

              {/* Add Provider */}
              <section
                class="rounded-lg overflow-hidden"
                style={{
                  background: "var(--background-base)",
                  border: "1px solid var(--border-base)",
                }}
              >
                <div class="px-4 py-3" style={{ "border-bottom": "1px solid var(--border-base)" }}>
                  <h2 class="text-sm font-medium" style={{ color: "var(--text-strong)" }}>
                    Add Provider
                  </h2>
                </div>
                <div class="p-4">
                  <Show when={success()}>
                    <div class="mb-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded-md text-sm">
                      {success()}
                    </div>
                  </Show>

                  <Show when={error()}>
                    <div class="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-md text-sm">
                      {error()}
                    </div>
                  </Show>

                  <form onSubmit={handleConnect} class="space-y-4">
                    {/* Provider Selection */}
                    <div>
                      <label class="block text-sm font-medium mb-2" style={{ color: "var(--text-base)" }}>
                        Select Provider
                      </label>
                      <div class="grid grid-cols-2 gap-2">
                        <For each={providers.providers.filter((p) => !providers.connected.includes(p.id)).slice(0, 8)}>
                          {(provider) => (
                            <button
                              type="button"
                              onClick={() => setSelectedProvider(provider.id)}
                              class="p-3 rounded-md text-left transition-colors"
                              style={{
                                border:
                                  selectedProvider() === provider.id
                                    ? "1px solid var(--interactive-base)"
                                    : "1px solid var(--border-base)",
                                background: selectedProvider() === provider.id ? "var(--surface-inset)" : "transparent",
                              }}
                            >
                              <div class="text-sm font-medium" style={{ color: "var(--text-strong)" }}>
                                {provider.name}
                              </div>
                              <div class="text-xs" style={{ color: "var(--text-weak)" }}>
                                {Object.keys(provider.models).length} models
                              </div>
                            </button>
                          )}
                        </For>
                      </div>

                      <Show when={providers.providers.filter((p) => !providers.connected.includes(p.id)).length === 0}>
                        <p class="text-sm" style={{ color: "var(--text-weak)" }}>
                          All available providers are connected!
                        </p>
                      </Show>
                    </div>

                    {/* API Key Input */}
                    <Show when={selectedProvider()}>
                      <div>
                        <label class="block text-sm font-medium mb-2" style={{ color: "var(--text-base)" }}>
                          API Key for {getProviderDisplayName(selectedProvider()!)}
                        </label>
                        <input
                          type="password"
                          value={apiKey()}
                          onInput={(e) => setApiKey(e.currentTarget.value)}
                          placeholder="Enter your API key..."
                          class="w-full px-3 py-2 rounded-md text-sm"
                          style={{
                            background: "var(--background-base)",
                            border: "1px solid var(--border-base)",
                            color: "var(--text-base)",
                          }}
                        />
                        <p class="text-xs mt-1" style={{ color: "var(--text-weak)" }}>
                          Your API key is stored securely and never shared.
                        </p>
                      </div>

                      <button
                        type="submit"
                        disabled={connecting() || !apiKey().trim()}
                        class="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                        style={{
                          background: "var(--interactive-base)",
                          color: "white",
                        }}
                      >
                        <Show when={connecting()} fallback="Connect Provider">
                          <Spinner class="w-4 h-4" />
                          Connecting...
                        </Show>
                      </button>
                    </Show>
                  </form>
                </div>
              </section>
            </div>
          </Show>

          {/* MCP Servers Tab */}
          <Show when={activeTab() === "mcp"}>
            <div class="space-y-6">
              <header>
                <h1 class="text-lg font-medium" style={{ color: "var(--text-strong)" }}>
                  MCP Servers
                </h1>
                <p class="text-sm mt-1" style={{ color: "var(--text-weak)" }}>
                  Model Context Protocol servers extend AI capabilities with tools and resources
                </p>
              </header>

              {/* Server List */}
              <section
                class="rounded-lg overflow-hidden"
                style={{
                  background: "var(--background-base)",
                  border: "1px solid var(--border-base)",
                }}
              >
                <div
                  class="px-4 py-3 flex items-center justify-between"
                  style={{ "border-bottom": "1px solid var(--border-base)" }}
                >
                  <h2 class="text-sm font-medium" style={{ color: "var(--text-strong)" }}>
                    Configured Servers ({mcp.stats().enabled}/{mcp.stats().total} connected)
                  </h2>
                  <button
                    onClick={() => setShowMCPAddDialog(true)}
                    class="text-xs px-2 py-1 rounded transition-colors"
                    style={{
                      background: "var(--interactive-base)",
                      color: "white",
                    }}
                  >
                    + Add Server
                  </button>
                </div>

                <Show when={mcp.loading()}>
                  <div class="p-6 flex items-center justify-center gap-2" style={{ color: "var(--text-weak)" }}>
                    <Spinner class="w-4 h-4" />
                    <span class="text-sm">Loading...</span>
                  </div>
                </Show>

                <Show when={!mcp.loading() && Object.keys(mcp.servers).length === 0}>
                  <div class="p-6 text-center">
                    <p class="text-sm" style={{ color: "var(--text-weak)" }}>
                      No MCP servers configured yet.
                    </p>
                    <button
                      onClick={() => setShowMCPAddDialog(true)}
                      class="mt-2 text-sm hover:underline"
                      style={{ color: "var(--text-interactive-base)" }}
                    >
                      Add your first server
                    </button>
                  </div>
                </Show>

                <Show when={!mcp.loading() && Object.keys(mcp.servers).length > 0}>
                  <div class="divide-y" style={{ "border-color": "var(--border-base)" }}>
                    <For each={Object.entries(mcp.servers).sort((a, b) => a[0].localeCompare(b[0]))}>
                      {([name, status]) => {
                        const isConnected = () => status.status === "connected"
                        const isFailed = () => status.status === "failed"
                        const needsAuth = () => status.status === "needs_auth"
                        const errorMsg = () => (status.status === "failed" ? (status as any).error : undefined)

                        return (
                          <div class="px-4 py-3 flex items-center justify-between gap-4">
                            <div class="flex-1 min-w-0">
                              <div class="flex items-center gap-2">
                                <span class="font-medium text-sm" style={{ color: "var(--text-strong)" }}>
                                  {name}
                                </span>
                                <span
                                  class="text-xs px-1.5 py-0.5 rounded"
                                  style={{
                                    background: "var(--surface-inset)",
                                    color: isConnected()
                                      ? "var(--icon-success-base)"
                                      : isFailed()
                                        ? "var(--icon-critical-base)"
                                        : needsAuth()
                                          ? "var(--icon-warning-base)"
                                          : "var(--text-weak)",
                                  }}
                                >
                                  {status.status === "connected"
                                    ? "Connected"
                                    : status.status === "disabled"
                                      ? "Disabled"
                                      : status.status === "failed"
                                        ? "Failed"
                                        : status.status === "needs_auth"
                                          ? "Needs Auth"
                                          : status.status}
                                </span>
                                <Show when={mcpLoading() === name}>
                                  <Spinner class="w-3 h-3" />
                                </Show>
                              </div>
                              <Show when={errorMsg()}>
                                <p class="text-xs mt-0.5 truncate" style={{ color: "var(--text-weak)" }}>
                                  {errorMsg()}
                                </p>
                              </Show>
                            </div>

                            <div class="flex items-center gap-2">
                              <Show when={needsAuth()}>
                                <button
                                  onClick={async () => {
                                    setMcpLoading(name)
                                    const result = await mcp.startAuth(name)
                                    if (result?.authorizationUrl) {
                                      window.open(result.authorizationUrl, "_blank")
                                    }
                                    setMcpLoading(null)
                                  }}
                                  class="text-xs px-2 py-1 rounded"
                                  style={{
                                    background: "var(--surface-inset)",
                                    color: "var(--text-interactive-base)",
                                  }}
                                >
                                  Authenticate
                                </button>
                              </Show>

                              {/* Toggle Switch */}
                              <button
                                onClick={async () => {
                                  setMcpLoading(name)
                                  if (isConnected()) {
                                    await mcp.disconnect(name)
                                  } else {
                                    await mcp.connect(name)
                                  }
                                  setMcpLoading(null)
                                }}
                                disabled={mcpLoading() === name}
                                class="relative w-10 h-5 rounded-full transition-colors disabled:opacity-50"
                                style={{
                                  background: isConnected() ? "var(--interactive-base)" : "var(--surface-inset)",
                                }}
                              >
                                <div
                                  class="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                                  style={{
                                    background: "white",
                                    left: isConnected() ? "calc(100% - 18px)" : "2px",
                                  }}
                                />
                              </button>
                            </div>
                          </div>
                        )
                      }}
                    </For>
                  </div>
                </Show>
              </section>

              {/* Info Section */}
              <section
                class="rounded-lg p-4"
                style={{
                  background: "var(--surface-inset)",
                  border: "1px solid var(--border-base)",
                }}
              >
                <h3 class="text-sm font-medium mb-2" style={{ color: "var(--text-strong)" }}>
                  About MCP
                </h3>
                <p class="text-xs" style={{ color: "var(--text-weak)" }}>
                  The Model Context Protocol (MCP) allows AI assistants to access external tools, APIs, and data
                  sources. Servers can be local (running commands on your machine) or remote (connecting to hosted
                  services).
                </p>
                <a
                  href="https://modelcontextprotocol.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-xs mt-2 inline-block hover:underline"
                  style={{ color: "var(--text-interactive-base)" }}
                >
                  Learn more about MCP →
                </a>
              </section>
            </div>
          </Show>

          {/* Models Tab */}
          <Show when={activeTab() === "models"}>
            <div class="space-y-6">
              <header>
                <h1 class="text-lg font-medium" style={{ color: "var(--text-strong)" }}>
                  Models
                </h1>
                <p class="text-sm mt-1" style={{ color: "var(--text-weak)" }}>
                  Available models from connected providers
                </p>
              </header>

              <Show when={providers.connected.length === 0}>
                <div
                  class="p-6 rounded-lg text-center"
                  style={{
                    background: "var(--background-base)",
                    border: "1px solid var(--border-base)",
                  }}
                >
                  <p class="text-sm" style={{ color: "var(--text-weak)" }}>
                    Connect a provider to see available models.
                  </p>
                </div>
              </Show>

              <For each={providers.providers.filter((p) => providers.connected.includes(p.id))}>
                {(provider) => (
                  <section
                    class="rounded-lg overflow-hidden"
                    style={{
                      background: "var(--background-base)",
                      border: "1px solid var(--border-base)",
                    }}
                  >
                    <div class="px-4 py-3" style={{ "border-bottom": "1px solid var(--border-base)" }}>
                      <h2 class="text-sm font-medium" style={{ color: "var(--text-strong)" }}>
                        {provider.name}
                      </h2>
                    </div>
                    <div class="p-2">
                      <For each={Object.values(provider.models).slice(0, 10)}>
                        {(model) => (
                          <div class="px-3 py-2 rounded-md text-sm" style={{ color: "var(--text-base)" }}>
                            {model.name}
                          </div>
                        )}
                      </For>
                      <Show when={Object.keys(provider.models).length > 10}>
                        <div class="px-3 py-2 text-xs" style={{ color: "var(--text-weak)" }}>
                          +{Object.keys(provider.models).length - 10} more models
                        </div>
                      </Show>
                    </div>
                  </section>
                )}
              </For>
            </div>
          </Show>

          {/* Agents Tab */}
          <Show when={activeTab() === "agents"}>
            <div class="space-y-6">
              <header>
                <h1 class="text-lg font-medium" style={{ color: "var(--text-strong)" }}>
                  Agents
                </h1>
                <p class="text-sm mt-1" style={{ color: "var(--text-weak)" }}>
                  Available agents for different tasks
                </p>
              </header>

              <section
                class="rounded-lg overflow-hidden"
                style={{
                  background: "var(--background-base)",
                  border: "1px solid var(--border-base)",
                }}
              >
                <Show when={providers.agents.length === 0}>
                  <div class="p-6 text-center">
                    <p class="text-sm" style={{ color: "var(--text-weak)" }}>
                      No agents available.
                    </p>
                  </div>
                </Show>

                <div class="p-2">
                  <For each={providers.agents}>
                    {(agent) => (
                      <button
                        class="w-full flex items-center justify-between px-3 py-2 rounded-md text-left transition-colors"
                        style={{
                          background: providers.selectedAgent === agent.name ? "var(--surface-inset)" : "transparent",
                          color:
                            providers.selectedAgent === agent.name
                              ? "var(--text-interactive-base)"
                              : "var(--text-base)",
                        }}
                        onClick={() => providers.setSelectedAgent(agent.name)}
                        onMouseEnter={(e) => {
                          if (providers.selectedAgent !== agent.name)
                            e.currentTarget.style.background = "var(--surface-inset)"
                        }}
                        onMouseLeave={(e) => {
                          if (providers.selectedAgent !== agent.name) e.currentTarget.style.background = "transparent"
                        }}
                      >
                        <span class="text-sm font-medium capitalize">{agent.name}</span>
                        <Show when={providers.selectedAgent === agent.name}>
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                          </svg>
                        </Show>
                      </button>
                    )}
                  </For>
                </div>
              </section>
            </div>
          </Show>
        </div>
      </div>

      {/* MCP Add Dialog */}
      <Show when={showMCPAddDialog()}>
        <MCPAddDialog onClose={() => setShowMCPAddDialog(false)} onBack={() => setShowMCPAddDialog(false)} />
      </Show>
    </div>
  )
}
