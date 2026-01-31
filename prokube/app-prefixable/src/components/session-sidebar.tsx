import { createSignal, createEffect, For, Show, onCleanup } from "solid-js"
import { useSDK } from "../context/sdk"
import { useEvents } from "../context/events"
import { GitBranch, Check, Circle, Loader2, ChevronLeft, ChevronRight } from "lucide-solid"

interface Todo {
  id: string
  content: string
  status: string
  priority: string
}

interface SessionSidebarProps {
  sessionId: string | undefined
}

export function SessionSidebar(props: SessionSidebarProps) {
  const { client, directory } = useSDK()
  const events = useEvents()

  const [todos, setTodos] = createSignal<Todo[]>([])
  const [branch, setBranch] = createSignal<string | null>(null)
  const [collapsed, setCollapsed] = createSignal(true) // Default collapsed

  // Load git branch
  async function loadBranch() {
    try {
      console.log("[SessionSidebar] Loading branch, directory:", directory)
      const res = await client.vcs.get({ directory })
      console.log("[SessionSidebar] Branch response:", res)
      if (res.data?.branch) {
        setBranch(res.data.branch)
      }
    } catch (e) {
      console.error("[SessionSidebar] Failed to load branch:", e)
    }
  }

  // Load todos for session
  async function loadTodos(sessionId: string) {
    try {
      const res = await client.session.todo({ sessionID: sessionId, directory })
      if (res.data) {
        setTodos(res.data as Todo[])
      }
    } catch (e) {
      console.error("[SessionSidebar] Failed to load todos:", e)
      setTodos([])
    }
  }

  // Load data when sessionId changes
  createEffect(() => {
    const id = props.sessionId
    loadBranch()
    if (id) {
      loadTodos(id)
    } else {
      setTodos([])
    }
  })

  // Subscribe to todo updates
  createEffect(() => {
    const id = props.sessionId
    if (!id) return

    const unsub = events.subscribe((event) => {
      if (event.type === "todo.updated") {
        const eventProps = event.properties as { sessionID: string; todos: Todo[] }
        if (eventProps.sessionID === id) {
          setTodos(eventProps.todos)
        }
      }
      if (event.type === "vcs.branch.updated") {
        const eventProps = event.properties as { branch: string }
        setBranch(eventProps.branch)
      }
    })

    onCleanup(unsub)
  })

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <Check class="w-3 h-3 shrink-0" style={{ color: "var(--icon-success-base)" }} />
      case "in_progress":
        return <Loader2 class="w-3 h-3 shrink-0 animate-spin" style={{ color: "var(--text-interactive-base)" }} />
      default:
        return <Circle class="w-3 h-3 shrink-0" style={{ color: "var(--icon-weak)" }} />
    }
  }

  const pendingTodos = () => todos().filter((t) => t.status === "pending" || t.status === "in_progress")
  const completedTodos = () => todos().filter((t) => t.status === "completed" || t.status === "cancelled")

  return (
    <Show
      when={!collapsed()}
      fallback={
        <div
          class="w-6 shrink-0 flex flex-col items-center pt-3 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
          style={{ background: "var(--background-base)", "border-left": "1px solid var(--border-base)" }}
          onClick={() => setCollapsed(false)}
        >
          <ChevronLeft class="w-4 h-4" style={{ color: "var(--icon-weak)" }} />
        </div>
      }
    >
      <div
        class="w-64 shrink-0 flex flex-col overflow-hidden"
        style={{ background: "var(--background-base)", "border-left": "1px solid var(--border-base)" }}
      >
        {/* Header */}
        <div
          class="flex items-center justify-between px-3 py-2"
          style={{ "border-bottom": "1px solid var(--border-base)" }}
        >
          <span class="text-xs font-medium uppercase" style={{ color: "var(--text-weak)" }}>
            Info
          </span>
          <button
            onClick={() => setCollapsed(true)}
            class="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5"
            style={{ color: "var(--icon-weak)" }}
          >
            <ChevronRight class="w-4 h-4" />
          </button>
        </div>

        {/* Git Branch */}
        <Show when={branch()}>
          <div class="px-3 py-2 flex items-center gap-2" style={{ "border-bottom": "1px solid var(--border-base)" }}>
            <GitBranch class="w-3 h-3 shrink-0" style={{ color: "var(--icon-weak)" }} />
            <span class="text-xs font-mono truncate" style={{ color: "var(--text-base)" }}>
              {branch()}
            </span>
          </div>
        </Show>

        {/* Todos */}
        <div class="flex-1 overflow-y-auto">
          <Show
            when={todos().length > 0}
            fallback={
              <div class="px-3 py-3 text-center">
                <span class="text-xs" style={{ color: "var(--text-weak)" }}>
                  No tasks
                </span>
              </div>
            }
          >
            {/* Pending/In Progress */}
            <Show when={pendingTodos().length > 0}>
              <div class="px-3 py-2">
                <div class="text-xs font-medium uppercase mb-1.5" style={{ color: "var(--text-weak)" }}>
                  Tasks ({pendingTodos().length})
                </div>
                <div class="space-y-1">
                  <For each={pendingTodos()}>
                    {(todo) => (
                      <div class="flex items-start gap-2 py-0.5">
                        <div class="pt-0.5">{statusIcon(todo.status)}</div>
                        <span class="text-xs" style={{ color: "var(--text-base)" }}>
                          {todo.content}
                        </span>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            {/* Completed */}
            <Show when={completedTodos().length > 0}>
              <div class="px-3 py-2">
                <div class="text-xs font-medium uppercase mb-1.5" style={{ color: "var(--text-weak)" }}>
                  Done ({completedTodos().length})
                </div>
                <div class="space-y-1">
                  <For each={completedTodos()}>
                    {(todo) => (
                      <div class="flex items-start gap-2 py-0.5 opacity-50">
                        <div class="pt-0.5">{statusIcon(todo.status)}</div>
                        <span class="text-xs line-through" style={{ color: "var(--text-weak)" }}>
                          {todo.content}
                        </span>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </Show>
        </div>
      </div>
    </Show>
  )
}
