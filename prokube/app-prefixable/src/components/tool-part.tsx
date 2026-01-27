import { createSignal, createEffect, Show, For } from "solid-js"
import type { Part, ToolPart as SDKToolPart, ToolState } from "@opencode-ai/sdk/v2/client"
import { ChevronDown } from "lucide-solid"
import { ContentDiff } from "./diff/content-diff"

// Use the SDK's ToolPart type
type ToolPart = SDKToolPart

function isToolPart(part: Part): part is ToolPart {
  return part.type === "tool"
}

// Get status from tool state
function getStatus(state: ToolState): "pending" | "running" | "completed" | "error" {
  return state.status
}

// Check if state has output
function hasOutput(state: ToolState): boolean {
  return state.status === "completed" || state.status === "error"
}

// Get output from state
function getOutput(state: ToolState): string | undefined {
  if (state.status === "completed") return state.output
  return undefined
}

// Get error from state
function getError(state: ToolState): string | undefined {
  if (state.status === "error") return state.error
  return undefined
}

// Get input from state
function getInput(state: ToolState): Record<string, unknown> | undefined {
  return state.input
}

// Get title from state
function getTitle(state: ToolState): string | undefined {
  if (state.status === "completed") return state.title
  if (state.status === "running") return state.title
  return undefined
}

// Get icon for tool type
function getToolIcon(tool: string): string {
  const icons: Record<string, string> = {
    bash: "M4 17l6-6-6-6M12 19h8",
    read: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    write:
      "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
    edit: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
    glob: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    grep: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    list: "M4 6h16M4 10h16M4 14h16M4 18h16",
    webfetch:
      "M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9",
    task: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    todowrite:
      "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
    question:
      "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  }
  return icons[tool] || "M13 10V3L4 14h7v7l9-11h-7z" // Default: lightning bolt
}

// Get status color
function getStatusColor(status: string): string {
  switch (status) {
    case "completed":
      return "var(--icon-success-base)"
    case "running":
      return "var(--text-interactive-base)"
    case "pending":
      return "var(--text-weak)"
    case "error":
      return "var(--icon-critical-base)"
    default:
      return "var(--text-weak)"
  }
}

// Format tool input for display
function formatInput(input: unknown): string {
  if (!input) return ""
  if (typeof input === "string") return input
  try {
    return JSON.stringify(input, null, 2)
  } catch {
    return String(input)
  }
}

// Get language from file extension for syntax highlighting
function getLangFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? ""
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    json: "json",
    md: "markdown",
    css: "css",
    scss: "scss",
    html: "html",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    sql: "sql",
    graphql: "graphql",
    vue: "vue",
    svelte: "svelte",
    astro: "astro",
  }
  return langMap[ext] || "text"
}

// Get metadata from state
function getMetadata(state: ToolState): Record<string, unknown> | undefined {
  if (state.status === "completed") return state.metadata as Record<string, unknown> | undefined
  if (state.status === "running") return state.metadata as Record<string, unknown> | undefined
  return undefined
}

export function ToolPartDisplay(props: { part: ToolPart }) {
  const [expanded, setExpanded] = createSignal(false)
  let autoExpanded = false

  const state = () => props.part.state
  const status = () => getStatus(state())
  const metadata = () => getMetadata(state())
  const isEdit = () => props.part.tool === "edit"
  const hasDiff = () => isEdit() && metadata()?.diff
  // Can expand if has output OR has diff
  const canExpand = () => hasOutput(state()) || hasDiff()
  const title = () => getTitle(state()) || props.part.tool
  const filePath = () => (getInput(state()) as { filePath?: string })?.filePath || ""

  // Auto-expand edit tools when diff becomes available (only once)
  createEffect(() => {
    if (hasDiff() && !autoExpanded) {
      autoExpanded = true
      setExpanded(true)
    }
  })

  return (
    <div
      class="rounded-md overflow-hidden"
      style={{
        border: "1px solid var(--border-base)",
        background: "var(--background-base)",
      }}
    >
      {/* Header - always visible */}
      <button
        onClick={() => canExpand() && setExpanded(!expanded())}
        class="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors"
        style={{
          background: expanded() ? "var(--surface-inset)" : "transparent",
          cursor: canExpand() ? "pointer" : "default",
        }}
        onMouseEnter={(e) => {
          if (canExpand() && !expanded()) e.currentTarget.style.background = "var(--surface-inset)"
        }}
        onMouseLeave={(e) => {
          if (!expanded()) e.currentTarget.style.background = "transparent"
        }}
      >
        {/* Tool icon */}
        <svg
          class="w-4 h-4 shrink-0"
          style={{ color: getStatusColor(status()) }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getToolIcon(props.part.tool)} />
        </svg>

        {/* Tool name/title */}
        <span class="font-mono text-sm flex-1 truncate" style={{ color: "var(--text-strong)" }}>
          {title()}
        </span>

        {/* Status indicator */}
        <span class="text-xs shrink-0" style={{ color: getStatusColor(status()) }}>
          {status() === "running" && "running..."}
          {status() === "pending" && "pending"}
          {status() === "error" && "error"}
        </span>

        {/* Expand arrow */}
        <Show when={canExpand()}>
          <ChevronDown
            class="w-4 h-4 shrink-0 transition-transform"
            style={{
              color: "var(--icon-weak)",
              transform: expanded() ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </Show>
      </button>

      {/* Diff display for edit tools - controlled by expanded state */}
      <Show when={expanded() && hasDiff()}>
        <div class="px-3 py-2" style={{ "border-top": "1px solid var(--border-base)" }}>
          <ContentDiff diff={metadata()?.diff as string} lang={getLangFromPath(filePath())} />
        </div>
      </Show>

      {/* Expanded content for non-edit tools or when no diff */}
      <Show when={expanded() && canExpand() && !hasDiff()}>
        <div
          class="px-3 py-2 text-sm font-mono overflow-x-auto"
          style={{
            "border-top": "1px solid var(--border-base)",
            background: "var(--background-stronger)",
          }}
        >
          {/* Input */}
          <Show when={getInput(state())}>
            {(input) => (
              <div class="mb-2">
                <div class="text-xs mb-1" style={{ color: "var(--text-weak)" }}>
                  Input:
                </div>
                <pre class="whitespace-pre-wrap text-xs" style={{ color: "var(--text-base)" }}>
                  {formatInput(input())}
                </pre>
              </div>
            )}
          </Show>

          {/* Output */}
          <Show when={getOutput(state())}>
            {(output) => (
              <div>
                <div class="text-xs mb-1" style={{ color: "var(--text-weak)" }}>
                  Output:
                </div>
                <pre class="whitespace-pre-wrap text-xs max-h-64 overflow-y-auto" style={{ color: "var(--text-base)" }}>
                  {output()}
                </pre>
              </div>
            )}
          </Show>

          {/* Error */}
          <Show when={getError(state())}>
            {(err) => (
              <div
                class="px-2 py-1 rounded text-xs"
                style={{ background: "var(--status-danger-dim)", color: "var(--status-danger-text)" }}
              >
                {err()}
              </div>
            )}
          </Show>
        </div>
      </Show>
    </div>
  )
}

// Render tool parts from a message
export function MessageParts(props: { parts: Part[] }) {
  // Filter to only tool parts
  const toolParts = () => props.parts.filter(isToolPart)

  return (
    <Show when={toolParts().length > 0}>
      <div class="space-y-2 mt-3">
        <For each={toolParts()}>{(part) => <ToolPartDisplay part={part} />}</For>
      </div>
    </Show>
  )
}
