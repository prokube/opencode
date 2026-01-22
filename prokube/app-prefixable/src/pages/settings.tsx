import { createSignal, For, Show } from "solid-js"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useProviders } from "../context/providers"

export function Settings() {
  const providers = useProviders()
  const [selectedProvider, setSelectedProvider] = createSignal<string | null>(null)
  const [apiKey, setApiKey] = createSignal("")
  const [connecting, setConnecting] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [success, setSuccess] = createSignal<string | null>(null)
  const [activeTab, setActiveTab] = createSignal("providers")

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
    { id: "providers", label: "Providers", icon: "server" },
    { id: "models", label: "Models", icon: "brain" },
    { id: "agents", label: "Agents", icon: "task" },
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
    </div>
  )
}
