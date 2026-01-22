import { createSignal, For, Show } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useProviders } from "../context/providers"

export function Settings() {
  const providers = useProviders()
  const [selectedProvider, setSelectedProvider] = createSignal<string | null>(null)
  const [apiKey, setApiKey] = createSignal("")
  const [connecting, setConnecting] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [success, setSuccess] = createSignal<string | null>(null)

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

  return (
    <div class="h-full overflow-y-auto">
      <div class="max-w-2xl mx-auto p-6 space-y-8">
        <header>
          <h1 class="text-2xl font-bold text-gray-900">Settings</h1>
          <p class="text-gray-500 mt-1">Configure AI providers and preferences</p>
        </header>

        {/* Connected Providers */}
        <section class="pk-card">
          <div class="pk-card-header">
            <h2 class="pk-card-title">Connected Providers</h2>
          </div>
          <div class="pk-card-content">
            <Show when={providers.loading}>
              <div class="flex items-center gap-2 text-gray-500">
                <Spinner class="w-4 h-4" />
                Loading...
              </div>
            </Show>

            <Show when={!providers.loading && providers.connected.length === 0}>
              <p class="text-gray-500">No providers connected yet.</p>
            </Show>

            <Show when={!providers.loading && providers.connected.length > 0}>
              <ul class="space-y-2">
                <For each={providers.connected}>
                  {(providerID) => (
                    <li class="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div class="flex items-center gap-3">
                        <div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                          <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <span class="font-medium text-gray-900">{getProviderDisplayName(providerID)}</span>
                      </div>
                      <span class="text-sm text-green-600">Connected</span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>
        </section>

        {/* Add Provider */}
        <section class="pk-card">
          <div class="pk-card-header">
            <h2 class="pk-card-title">Add Provider</h2>
          </div>
          <div class="pk-card-content">
            <Show when={success()}>
              <div class="mb-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded-lg">{success()}</div>
            </Show>

            <Show when={error()}>
              <div class="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg">{error()}</div>
            </Show>

            <form onSubmit={handleConnect} class="space-y-4">
              {/* Provider Selection */}
              <div>
                <label class="pk-label">Select Provider</label>
                <div class="grid grid-cols-2 gap-2">
                  <For each={providers.providers.filter((p) => !providers.connected.includes(p.id))}>
                    {(provider) => (
                      <button
                        type="button"
                        onClick={() => setSelectedProvider(provider.id)}
                        class="p-3 border rounded-lg text-left transition-colors"
                        classList={{
                          "border-purple-500 bg-purple-50": selectedProvider() === provider.id,
                          "border-gray-200 hover:border-gray-300": selectedProvider() !== provider.id,
                        }}
                      >
                        <div class="font-medium text-gray-900">{provider.name}</div>
                        <div class="text-xs text-gray-500">{Object.keys(provider.models).length} models</div>
                      </button>
                    )}
                  </For>
                </div>

                <Show when={providers.providers.filter((p) => !providers.connected.includes(p.id)).length === 0}>
                  <p class="text-gray-500 text-sm">All available providers are connected!</p>
                </Show>
              </div>

              {/* API Key Input */}
              <Show when={selectedProvider()}>
                <div>
                  <label class="pk-label">API Key for {getProviderDisplayName(selectedProvider()!)}</label>
                  <input
                    type="password"
                    value={apiKey()}
                    onInput={(e) => setApiKey(e.currentTarget.value)}
                    placeholder="Enter your API key..."
                    class="pk-input"
                  />
                  <p class="pk-help-text">Your API key is stored securely and never shared.</p>
                </div>

                <Button type="submit" disabled={connecting() || !apiKey().trim()}>
                  <Show when={connecting()} fallback="Connect Provider">
                    <Spinner class="w-4 h-4 mr-2" />
                    Connecting...
                  </Show>
                </Button>
              </Show>
            </form>
          </div>
        </section>

        {/* Available Models */}
        <section class="pk-card">
          <div class="pk-card-header">
            <h2 class="pk-card-title">Available Models</h2>
          </div>
          <div class="pk-card-content">
            <Show when={providers.connected.length === 0}>
              <p class="text-gray-500">Connect a provider to see available models.</p>
            </Show>

            <Show when={providers.connected.length > 0}>
              <div class="space-y-4">
                <For each={providers.providers.filter((p) => providers.connected.includes(p.id))}>
                  {(provider) => (
                    <div>
                      <h3 class="font-medium text-gray-900 mb-2">{provider.name}</h3>
                      <div class="grid grid-cols-1 gap-1">
                        <For each={Object.values(provider.models).slice(0, 5)}>
                          {(model) => (
                            <div class="text-sm text-gray-600 py-1 px-2 bg-gray-50 rounded">{model.name}</div>
                          )}
                        </For>
                        <Show when={Object.keys(provider.models).length > 5}>
                          <div class="text-sm text-gray-400 py-1">
                            +{Object.keys(provider.models).length - 5} more models
                          </div>
                        </Show>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </section>

        {/* Agents */}
        <section class="pk-card">
          <div class="pk-card-header">
            <h2 class="pk-card-title">Available Agents</h2>
          </div>
          <div class="pk-card-content">
            <Show when={providers.agents.length === 0}>
              <p class="text-gray-500">No agents available.</p>
            </Show>

            <div class="space-y-2">
              <For each={providers.agents}>
                {(agent) => (
                  <div
                    class="p-3 border rounded-lg cursor-pointer transition-colors"
                    classList={{
                      "border-purple-500 bg-purple-50": providers.selectedAgent === agent.name,
                      "border-gray-200 hover:border-gray-300": providers.selectedAgent !== agent.name,
                    }}
                    onClick={() => providers.setSelectedAgent(agent.name)}
                  >
                    <div class="font-medium text-gray-900 capitalize">{agent.name}</div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
