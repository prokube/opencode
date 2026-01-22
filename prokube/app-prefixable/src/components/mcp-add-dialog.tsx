import { createSignal, Show, For } from "solid-js"
import { useMCP, type McpLocalConfig, type McpRemoteConfig } from "../context/mcp"

interface Props {
  onClose: () => void
  onBack: () => void
}

interface EnvVar {
  key: string
  value: string
}

interface Header {
  key: string
  value: string
}

export function MCPAddDialog(props: Props) {
  const mcp = useMCP()
  const [type, setType] = createSignal<"local" | "remote">("remote")
  const [name, setName] = createSignal("")
  const [url, setUrl] = createSignal("")
  const [command, setCommand] = createSignal("")
  const [error, setError] = createSignal("")
  const [loading, setLoading] = createSignal(false)
  const [showAdvanced, setShowAdvanced] = createSignal(false)

  // Advanced options
  const [timeout, setTimeout] = createSignal("")
  const [envVars, setEnvVars] = createSignal<EnvVar[]>([])
  const [headers, setHeaders] = createSignal<Header[]>([])
  const [oauthEnabled, setOauthEnabled] = createSignal(true)
  const [oauthClientId, setOauthClientId] = createSignal("")
  const [oauthClientSecret, setOauthClientSecret] = createSignal("")
  const [oauthScope, setOauthScope] = createSignal("")

  function addEnvVar() {
    setEnvVars([...envVars(), { key: "", value: "" }])
  }

  function removeEnvVar(index: number) {
    setEnvVars(envVars().filter((_, i) => i !== index))
  }

  function updateEnvVar(index: number, field: "key" | "value", value: string) {
    setEnvVars(envVars().map((env, i) => (i === index ? { ...env, [field]: value } : env)))
  }

  function addHeader() {
    setHeaders([...headers(), { key: "", value: "" }])
  }

  function removeHeader(index: number) {
    setHeaders(headers().filter((_, i) => i !== index))
  }

  function updateHeader(index: number, field: "key" | "value", value: string) {
    setHeaders(headers().map((h, i) => (i === index ? { ...h, [field]: value } : h)))
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    setError("")

    const serverName = name().trim()
    if (!serverName) {
      setError("Name is required")
      return
    }

    // Parse timeout
    const timeoutMs = timeout().trim() ? parseInt(timeout().trim(), 10) : undefined
    if (timeoutMs !== undefined && (isNaN(timeoutMs) || timeoutMs <= 0)) {
      setError("Timeout must be a positive number")
      return
    }

    if (type() === "remote") {
      const serverUrl = url().trim()
      if (!serverUrl) {
        setError("URL is required")
        return
      }
      if (!serverUrl.startsWith("http://") && !serverUrl.startsWith("https://")) {
        setError("URL must start with http:// or https://")
        return
      }

      // Build headers object
      const headersObj: Record<string, string> = {}
      for (const h of headers()) {
        if (h.key.trim()) {
          headersObj[h.key.trim()] = h.value
        }
      }

      // Build OAuth config
      let oauth: McpRemoteConfig["oauth"] = undefined
      if (!oauthEnabled()) {
        oauth = false
      } else if (oauthClientId().trim() || oauthClientSecret().trim() || oauthScope().trim()) {
        oauth = {}
        if (oauthClientId().trim()) oauth.clientId = oauthClientId().trim()
        if (oauthClientSecret().trim()) oauth.clientSecret = oauthClientSecret().trim()
        if (oauthScope().trim()) oauth.scope = oauthScope().trim()
      }

      const config: McpRemoteConfig = {
        type: "remote",
        url: serverUrl,
        enabled: true,
      }
      if (Object.keys(headersObj).length > 0) config.headers = headersObj
      if (oauth !== undefined) config.oauth = oauth
      if (timeoutMs) config.timeout = timeoutMs

      setLoading(true)
      try {
        await mcp.add(serverName, config)
        props.onBack()
      } catch (e: any) {
        setError(e.message || "Failed to add server")
      } finally {
        setLoading(false)
      }
    } else {
      const cmd = command().trim()
      if (!cmd) {
        setError("Command is required")
        return
      }

      // Parse command string into array (simple split, doesn't handle quotes)
      const parts = cmd.split(/\s+/).filter(Boolean)
      if (parts.length === 0) {
        setError("Command is required")
        return
      }

      // Build environment object
      const envObj: Record<string, string> = {}
      for (const env of envVars()) {
        if (env.key.trim()) {
          envObj[env.key.trim()] = env.value
        }
      }

      const config: McpLocalConfig = {
        type: "local",
        command: parts,
        enabled: true,
      }
      if (Object.keys(envObj).length > 0) config.environment = envObj
      if (timeoutMs) config.timeout = timeoutMs

      setLoading(true)
      try {
        await mcp.add(serverName, config)
        props.onBack()
      } catch (e: any) {
        setError(e.message || "Failed to add server")
      } finally {
        setLoading(false)
      }
    }
  }

  const inputStyle = {
    background: "var(--background-base)",
    border: "1px solid var(--border-base)",
    color: "var(--text-base)",
  }

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose()
      }}
    >
      <div
        class="w-full max-w-lg max-h-[90vh] rounded-lg shadow-xl overflow-hidden flex flex-col"
        style={{
          background: "var(--background-base)",
          border: "1px solid var(--border-base)",
        }}
      >
        {/* Header */}
        <div
          class="px-4 py-3 flex items-center gap-3 shrink-0"
          style={{ "border-bottom": "1px solid var(--border-base)" }}
        >
          <button
            onClick={props.onBack}
            class="p-1 rounded transition-colors"
            style={{ color: "var(--icon-weak)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-inset)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div class="flex-1">
            <h2 class="text-base font-medium" style={{ color: "var(--text-strong)" }}>
              Add MCP Server
            </h2>
          </div>
          <button
            onClick={props.onClose}
            class="p-1 rounded transition-colors"
            style={{ color: "var(--icon-weak)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-inset)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form - Scrollable */}
        <form onSubmit={handleSubmit} class="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Type Selector */}
          <div class="flex gap-2">
            <button
              type="button"
              onClick={() => setType("remote")}
              class="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors"
              style={{
                background: type() === "remote" ? "var(--interactive-base)" : "var(--surface-inset)",
                color: type() === "remote" ? "white" : "var(--text-base)",
              }}
            >
              Remote (URL)
            </button>
            <button
              type="button"
              onClick={() => setType("local")}
              class="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors"
              style={{
                background: type() === "local" ? "var(--interactive-base)" : "var(--surface-inset)",
                color: type() === "local" ? "white" : "var(--text-base)",
              }}
            >
              Local (Command)
            </button>
          </div>

          {/* Name Field */}
          <div>
            <label class="block text-sm font-medium mb-1" style={{ color: "var(--text-base)" }}>
              Server Name
            </label>
            <input
              type="text"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder="my-mcp-server"
              class="w-full px-3 py-2 rounded-md text-sm"
              style={inputStyle}
            />
          </div>

          {/* URL Field (Remote) */}
          <Show when={type() === "remote"}>
            <div>
              <label class="block text-sm font-medium mb-1" style={{ color: "var(--text-base)" }}>
                Server URL
              </label>
              <input
                type="text"
                value={url()}
                onInput={(e) => setUrl(e.currentTarget.value)}
                placeholder="https://mcp.example.com/sse"
                class="w-full px-3 py-2 rounded-md text-sm"
                style={inputStyle}
              />
              <p class="text-xs mt-1" style={{ color: "var(--text-weak)" }}>
                The URL of the remote MCP server (SSE or HTTP endpoint)
              </p>
            </div>
          </Show>

          {/* Command Field (Local) */}
          <Show when={type() === "local"}>
            <div>
              <label class="block text-sm font-medium mb-1" style={{ color: "var(--text-base)" }}>
                Command
              </label>
              <input
                type="text"
                value={command()}
                onInput={(e) => setCommand(e.currentTarget.value)}
                placeholder="npx -y @modelcontextprotocol/server-filesystem ."
                class="w-full px-3 py-2 rounded-md text-sm font-mono"
                style={inputStyle}
              />
              <p class="text-xs mt-1" style={{ color: "var(--text-weak)" }}>
                The command to run the local MCP server
              </p>
            </div>
          </Show>

          {/* Advanced Options Toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced())}
            class="flex items-center gap-2 text-sm"
            style={{ color: "var(--text-interactive-base)" }}
          >
            <svg
              class="w-4 h-4 transition-transform"
              classList={{ "rotate-90": showAdvanced() }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            Advanced Options
          </button>

          <Show when={showAdvanced()}>
            <div class="space-y-4 pl-4" style={{ "border-left": "2px solid var(--border-base)" }}>
              {/* Timeout */}
              <div>
                <label class="block text-sm font-medium mb-1" style={{ color: "var(--text-base)" }}>
                  Timeout (ms)
                </label>
                <input
                  type="text"
                  value={timeout()}
                  onInput={(e) => setTimeout(e.currentTarget.value)}
                  placeholder="30000"
                  class="w-full px-3 py-2 rounded-md text-sm"
                  style={inputStyle}
                />
                <p class="text-xs mt-1" style={{ color: "var(--text-weak)" }}>
                  Request timeout in milliseconds (default: 30000)
                </p>
              </div>

              {/* Environment Variables (Local) */}
              <Show when={type() === "local"}>
                <div>
                  <div class="flex items-center justify-between mb-2">
                    <label class="text-sm font-medium" style={{ color: "var(--text-base)" }}>
                      Environment Variables
                    </label>
                    <button
                      type="button"
                      onClick={addEnvVar}
                      class="text-xs px-2 py-1 rounded"
                      style={{ color: "var(--text-interactive-base)", background: "var(--surface-inset)" }}
                    >
                      + Add
                    </button>
                  </div>
                  <div class="space-y-2">
                    <For each={envVars()}>
                      {(env, index) => (
                        <div class="flex gap-2">
                          <input
                            type="text"
                            value={env.key}
                            onInput={(e) => updateEnvVar(index(), "key", e.currentTarget.value)}
                            placeholder="KEY"
                            class="flex-1 px-2 py-1.5 rounded text-sm font-mono"
                            style={inputStyle}
                          />
                          <input
                            type="text"
                            value={env.value}
                            onInput={(e) => updateEnvVar(index(), "value", e.currentTarget.value)}
                            placeholder="value"
                            class="flex-1 px-2 py-1.5 rounded text-sm"
                            style={inputStyle}
                          />
                          <button
                            type="button"
                            onClick={() => removeEnvVar(index())}
                            class="p-1.5 rounded"
                            style={{ color: "var(--icon-critical-base)" }}
                          >
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </div>
                      )}
                    </For>
                  </div>
                  <p class="text-xs mt-1" style={{ color: "var(--text-weak)" }}>
                    Environment variables for the MCP server process (e.g., API keys)
                  </p>
                </div>
              </Show>

              {/* Headers (Remote) */}
              <Show when={type() === "remote"}>
                <div>
                  <div class="flex items-center justify-between mb-2">
                    <label class="text-sm font-medium" style={{ color: "var(--text-base)" }}>
                      HTTP Headers
                    </label>
                    <button
                      type="button"
                      onClick={addHeader}
                      class="text-xs px-2 py-1 rounded"
                      style={{ color: "var(--text-interactive-base)", background: "var(--surface-inset)" }}
                    >
                      + Add
                    </button>
                  </div>
                  <div class="space-y-2">
                    <For each={headers()}>
                      {(header, index) => (
                        <div class="flex gap-2">
                          <input
                            type="text"
                            value={header.key}
                            onInput={(e) => updateHeader(index(), "key", e.currentTarget.value)}
                            placeholder="Header-Name"
                            class="flex-1 px-2 py-1.5 rounded text-sm"
                            style={inputStyle}
                          />
                          <input
                            type="text"
                            value={header.value}
                            onInput={(e) => updateHeader(index(), "value", e.currentTarget.value)}
                            placeholder="value"
                            class="flex-1 px-2 py-1.5 rounded text-sm"
                            style={inputStyle}
                          />
                          <button
                            type="button"
                            onClick={() => removeHeader(index())}
                            class="p-1.5 rounded"
                            style={{ color: "var(--icon-critical-base)" }}
                          >
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </div>
                      )}
                    </For>
                  </div>
                  <p class="text-xs mt-1" style={{ color: "var(--text-weak)" }}>
                    Custom HTTP headers (e.g., Authorization: Bearer token)
                  </p>
                </div>

                {/* OAuth Settings */}
                <div>
                  <div class="flex items-center gap-3 mb-2">
                    <label class="text-sm font-medium" style={{ color: "var(--text-base)" }}>
                      OAuth Authentication
                    </label>
                    <button
                      type="button"
                      onClick={() => setOauthEnabled(!oauthEnabled())}
                      class="relative w-10 h-5 rounded-full transition-colors"
                      style={{
                        background: oauthEnabled() ? "var(--interactive-base)" : "var(--surface-inset)",
                      }}
                    >
                      <div
                        class="absolute top-0.5 w-4 h-4 rounded-full transition-transform"
                        style={{
                          background: "white",
                          left: oauthEnabled() ? "calc(100% - 18px)" : "2px",
                        }}
                      />
                    </button>
                  </div>

                  <Show when={oauthEnabled()}>
                    <div class="space-y-3 mt-3">
                      <div>
                        <input
                          type="text"
                          value={oauthClientId()}
                          onInput={(e) => setOauthClientId(e.currentTarget.value)}
                          placeholder="Client ID (optional)"
                          class="w-full px-2 py-1.5 rounded text-sm"
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <input
                          type="password"
                          value={oauthClientSecret()}
                          onInput={(e) => setOauthClientSecret(e.currentTarget.value)}
                          placeholder="Client Secret (optional)"
                          class="w-full px-2 py-1.5 rounded text-sm"
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <input
                          type="text"
                          value={oauthScope()}
                          onInput={(e) => setOauthScope(e.currentTarget.value)}
                          placeholder="Scopes (optional, space-separated)"
                          class="w-full px-2 py-1.5 rounded text-sm"
                          style={inputStyle}
                        />
                      </div>
                      <p class="text-xs" style={{ color: "var(--text-weak)" }}>
                        Leave empty for automatic client registration (RFC 7591)
                      </p>
                    </div>
                  </Show>

                  <Show when={!oauthEnabled()}>
                    <p class="text-xs" style={{ color: "var(--text-weak)" }}>
                      OAuth auto-detection is disabled
                    </p>
                  </Show>
                </div>
              </Show>
            </div>
          </Show>

          {/* Error */}
          <Show when={error()}>
            <div
              class="px-3 py-2 rounded-md text-sm"
              style={{
                background: "var(--surface-critical-base)",
                color: "var(--text-critical-base)",
              }}
            >
              {error()}
            </div>
          </Show>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading()}
            class="w-full px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
            style={{
              background: "var(--interactive-base)",
              color: "white",
            }}
          >
            {loading() ? "Adding..." : "Add Server"}
          </button>
        </form>
      </div>
    </div>
  )
}
