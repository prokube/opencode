import { createSignal, Show } from "solid-js"
import { useMCP } from "../context/mcp"

interface Props {
  onClose: () => void
  onBack: () => void
}

export function MCPAddDialog(props: Props) {
  const mcp = useMCP()
  const [type, setType] = createSignal<"local" | "remote">("remote")
  const [name, setName] = createSignal("")
  const [url, setUrl] = createSignal("")
  const [command, setCommand] = createSignal("")
  const [error, setError] = createSignal("")
  const [loading, setLoading] = createSignal(false)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    setError("")

    const serverName = name().trim()
    if (!serverName) {
      setError("Name is required")
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

      setLoading(true)
      try {
        await mcp.add(serverName, {
          type: "remote",
          url: serverUrl,
          enabled: true,
        })
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

      // Parse command string into array
      const parts = cmd.split(/\s+/).filter(Boolean)
      if (parts.length === 0) {
        setError("Command is required")
        return
      }

      setLoading(true)
      try {
        await mcp.add(serverName, {
          type: "local",
          command: parts,
          enabled: true,
        })
        props.onBack()
      } catch (e: any) {
        setError(e.message || "Failed to add server")
      } finally {
        setLoading(false)
      }
    }
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
        class="w-full max-w-md rounded-lg shadow-xl overflow-hidden"
        style={{
          background: "var(--background-base)",
          border: "1px solid var(--border-base)",
        }}
      >
        {/* Header */}
        <div class="px-4 py-3 flex items-center gap-3" style={{ "border-bottom": "1px solid var(--border-base)" }}>
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

        {/* Form */}
        <form onSubmit={handleSubmit} class="p-4 space-y-4">
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
              style={{
                background: "var(--background-base)",
                border: "1px solid var(--border-base)",
                color: "var(--text-base)",
              }}
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
                style={{
                  background: "var(--background-base)",
                  border: "1px solid var(--border-base)",
                  color: "var(--text-base)",
                }}
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
                style={{
                  background: "var(--background-base)",
                  border: "1px solid var(--border-base)",
                  color: "var(--text-base)",
                }}
              />
              <p class="text-xs mt-1" style={{ color: "var(--text-weak)" }}>
                The command to run the local MCP server
              </p>
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
