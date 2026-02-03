import { type ParentProps, createSignal, For, onMount, onCleanup, Show } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import { base64Encode, getServerUrl } from "../utils/path"
import { SDKProvider } from "../context/sdk"
import { EventProvider } from "../context/events"
import { ProviderProvider } from "../context/providers"
import { MCPProvider } from "../context/mcp"
import { ProjectDialog } from "../components/project-dialog"
import { Terminal } from "../components/terminal"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Plus, X, Settings, Folder, SquareTerminal, ChevronDown } from "lucide-solid"

// Storage key
const PROJECTS_STORAGE_KEY = "opencode.projects"

interface Project {
  worktree: string
  name?: string
}

function getFilename(path: string): string {
  return path.split("/").filter(Boolean).pop() || path
}

function getInitials(name: string): string {
  // Only use ASCII letters for initials
  const clean = name.replace(/[^a-zA-Z0-9\s_-]/g, "")
  if (!clean) return ""
  const parts = clean
    .split(/[-_\s]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("")
  return parts
}

// OpenCode Logo
function OpenCodeLogo(props: { class?: string }) {
  return (
    <svg class={props.class} viewBox="0 0 240 300" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M180 240H60V120H180V240Z" fill="#CFCECD" />
      <path d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" fill="#211E1E" />
    </svg>
  )
}

function ProjectAvatar(props: { project: Project; size?: "small" | "large"; selected?: boolean }) {
  const name = () => props.project.name || getFilename(props.project.worktree)
  const initials = () => getInitials(name())
  const size = () => (props.size === "large" ? "w-10 h-10" : "w-8 h-8")
  const iconSize = () => (props.size === "large" ? "w-5 h-5" : "w-4 h-4")

  // pkui button style: white bg, gray border, purple when selected/hovered
  return (
    <div
      class={`${size()} rounded-xl flex items-center justify-center font-medium text-sm shrink-0 transition-all border-2`}
      style={{
        background: props.selected ? "rgb(250, 245, 255)" : "white",
        color: props.selected ? "rgb(126, 34, 206)" : "rgb(55, 65, 81)",
        "border-color": props.selected ? "rgb(168, 85, 247)" : "rgb(229, 231, 235)",
        "box-shadow": props.selected ? "0 4px 6px -1px rgb(0 0 0 / 0.1)" : "none",
      }}
    >
      {initials() || <Folder class={iconSize()} />}
    </div>
  )
}

/**
 * Layout for the home screen (no active project).
 * Shows the left sidebar strip with projects, but no sessions panel.
 */
export function HomeLayout(props: ParentProps) {
  const navigate = useNavigate()

  const [projects, setProjects] = createSignal<Project[]>([])
  const [projectDialogOpen, setProjectDialogOpen] = createSignal(false)

  // Terminal state
  const [terminalOpen, setTerminalOpen] = createSignal(false)
  const [terminalPtyId, setTerminalPtyId] = createSignal<string | null>(null)
  const [terminalLoading, setTerminalLoading] = createSignal(false)
  const [terminalHeight, setTerminalHeight] = createSignal(300)

  // Client for PTY operations
  const client = createOpencodeClient({ baseUrl: getServerUrl(), throwOnError: false })

  onMount(() => {
    try {
      const stored = localStorage.getItem(PROJECTS_STORAGE_KEY)
      if (stored) {
        setProjects(JSON.parse(stored))
      }
    } catch (e) {
      console.error("Failed to load projects:", e)
    }
  })

  // Cleanup PTY on unmount
  onCleanup(() => {
    const ptyId = terminalPtyId()
    if (ptyId) {
      client.pty.remove({ ptyID: ptyId }).catch(() => {})
    }
  })

  async function toggleTerminal() {
    if (terminalOpen()) {
      // Close terminal
      const ptyId = terminalPtyId()
      if (ptyId) {
        try {
          await client.pty.remove({ ptyID: ptyId })
        } catch (e) {
          console.error("[HomeLayout] Failed to close PTY:", e)
        }
      }
      setTerminalPtyId(null)
      setTerminalOpen(false)
    } else {
      // Open terminal
      setTerminalOpen(true)
      setTerminalLoading(true)

      try {
        // Get home directory
        const pathRes = await client.path.get()
        const home = pathRes.data?.home || "~"

        // Create PTY in home directory
        const ptyRes = await client.pty.create({
          command: "/bin/bash",
          args: ["-l"],
          cwd: home,
        })

        if (!ptyRes.data?.id) {
          throw new Error("Failed to create terminal")
        }

        setTerminalPtyId(ptyRes.data.id)
      } catch (e) {
        console.error("[HomeLayout] Failed to open terminal:", e)
        setTerminalOpen(false)
      } finally {
        setTerminalLoading(false)
      }
    }
  }

  function saveProjects(list: Project[]) {
    setProjects(list)
    try {
      localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(list))
    } catch (e) {
      console.error("Failed to save projects:", e)
    }
  }

  function addProject(worktree: string) {
    const existing = projects().find((p) => p.worktree === worktree)
    if (!existing) {
      saveProjects([...projects(), { worktree }])
    }
  }

  function removeProject(worktree: string) {
    saveProjects(projects().filter((p) => p.worktree !== worktree))
  }

  function handleProjectSelect(worktree: string) {
    addProject(worktree)
    navigate(`/${base64Encode(worktree)}/session`)
  }

  function navigateToProject(worktree: string) {
    navigate(`/${base64Encode(worktree)}/session`)
  }

  return (
    <SDKProvider>
      <EventProvider>
        <ProviderProvider>
          <MCPProvider>
            <div class="flex h-screen" style={{ background: "var(--background-stronger)" }}>
              {/* Project Dialog */}
              <ProjectDialog
                open={projectDialogOpen()}
                onClose={() => setProjectDialogOpen(false)}
                onSelect={handleProjectSelect}
              />

              {/* Left: Project Icons Strip */}
              <div
                class="w-16 shrink-0 flex flex-col items-center"
                style={{ background: "var(--background-base)", "border-right": "1px solid var(--border-base)" }}
              >
                {/* Prokube Logo */}
                <button
                  onClick={() => setProjectDialogOpen(true)}
                  class="w-full flex items-center justify-center py-3 transition-opacity hover:opacity-80"
                  style={{ "border-bottom": "1px solid var(--border-base)" }}
                  title="Open Project"
                >
                  <OpenCodeLogo class="w-8 h-10 rounded" />
                </button>

                {/* Project icons */}
                <div class="flex-1 flex flex-col items-center gap-2 overflow-y-auto w-full px-2 py-3">
                  <For each={projects()}>
                    {(project) => (
                      <div
                        onClick={() => navigateToProject(project.worktree)}
                        class="group relative cursor-pointer"
                        title={project.name || getFilename(project.worktree)}
                      >
                        <ProjectAvatar project={project} size="large" selected={false} />
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            removeProject(project.worktree)
                          }}
                          class="absolute -top-1 -right-1 w-4 h-4 rounded-full hidden group-hover:flex items-center justify-center"
                          style={{ background: "var(--surface-strong)", color: "var(--text-base)" }}
                        >
                          <X class="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </For>

                  {/* Add project button */}
                  <button
                    onClick={() => setProjectDialogOpen(true)}
                    class="w-10 h-10 rounded-lg flex items-center justify-center transition-colors"
                    style={{ border: "2px dashed var(--border-base)", color: "var(--icon-weak)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-base)")}
                    title="Open Project"
                  >
                    <Plus class="w-5 h-5" />
                  </button>
                </div>

                {/* Bottom: Terminal & Settings */}
                <div
                  class="flex flex-col items-center gap-2 py-3"
                  style={{ "border-top": "1px solid var(--border-base)" }}
                >
                  <button
                    onClick={toggleTerminal}
                    class="w-10 h-10 rounded-lg flex items-center justify-center transition-colors"
                    style={{
                      color: terminalOpen() ? "var(--text-interactive-base)" : "var(--icon-base)",
                      background: terminalOpen() ? "var(--surface-inset)" : "transparent",
                    }}
                    title="Terminal (Ctrl+`)"
                  >
                    <SquareTerminal class="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => navigate("/settings")}
                    class="w-10 h-10 rounded-lg flex items-center justify-center transition-colors"
                    style={{ color: "var(--icon-base)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-inset)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    title="Settings"
                  >
                    <Settings class="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Main Content + Terminal */}
              <div class="flex-1 flex flex-col overflow-hidden">
                <main class="flex-1 flex flex-col overflow-hidden" style={{ background: "var(--background-stronger)" }}>
                  {props.children}
                </main>

                {/* Terminal Panel */}
                <Show when={terminalOpen()}>
                  <div
                    class="flex flex-col relative"
                    style={{
                      height: `${terminalHeight()}px`,
                      overflow: "hidden",
                      "border-top": "1px solid var(--border-base)",
                      background: "var(--background-base)",
                    }}
                  >
                    {/* Resize handle */}
                    <div
                      class="absolute top-0 left-0 right-0 h-1 cursor-ns-resize z-10 group"
                      style={{ background: "transparent" }}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        const startY = e.clientY
                        const startHeight = terminalHeight()

                        function onMouseMove(e: MouseEvent) {
                          const delta = startY - e.clientY
                          const newHeight = Math.max(100, Math.min(600, startHeight + delta))
                          setTerminalHeight(newHeight)
                        }

                        function onMouseUp() {
                          document.removeEventListener("mousemove", onMouseMove)
                          document.removeEventListener("mouseup", onMouseUp)
                        }

                        document.addEventListener("mousemove", onMouseMove)
                        document.addEventListener("mouseup", onMouseUp)
                      }}
                    >
                      <div
                        class="mx-auto mt-0.5 w-12 h-1 rounded-full transition-colors group-hover:bg-gray-400"
                        style={{ background: "var(--border-base)" }}
                      />
                    </div>

                    {/* Terminal header */}
                    <div
                      class="flex items-center justify-between px-3 py-1.5 shrink-0"
                      style={{ "border-bottom": "1px solid var(--border-base)" }}
                    >
                      <div class="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-weak)" }}>
                        <SquareTerminal class="w-3 h-3" />
                        <span>Terminal (Home)</span>
                      </div>
                      <button
                        onClick={toggleTerminal}
                        class="p-1 rounded transition-colors"
                        style={{ color: "var(--icon-weak)" }}
                        title="Close Terminal"
                      >
                        <ChevronDown class="w-4 h-4" />
                      </button>
                    </div>

                    {/* Terminal content */}
                    <div class="flex-1 overflow-hidden">
                      <Show when={terminalLoading()}>
                        <div class="flex items-center justify-center h-full gap-2" style={{ color: "var(--text-weak)" }}>
                          <Spinner class="w-5 h-5" />
                          <span>Starting terminal...</span>
                        </div>
                      </Show>

                      <Show when={!terminalLoading() && terminalPtyId()}>
                        <Terminal ptyId={terminalPtyId()!} />
                      </Show>
                    </div>
                  </div>
                </Show>
              </div>
            </div>
          </MCPProvider>
        </ProviderProvider>
      </EventProvider>
    </SDKProvider>
  )
}
