import { createSignal, For, Show, onMount } from "solid-js"
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import { useBasePath } from "../context/base-path"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Button } from "@opencode-ai/ui/button"
import { Folder, X } from "lucide-solid"

interface ProjectDialogProps {
  open: boolean
  onClose: () => void
  onSelect: (worktree: string) => void
}

export function ProjectDialog(props: ProjectDialogProps) {
  const { serverUrl } = useBasePath()

  const [homeDirectory, setHomeDirectory] = createSignal<string | null>(null)
  const [folderPath, setFolderPath] = createSignal("")
  const [folderSearch, setFolderSearch] = createSignal("")
  const [searchResults, setSearchResults] = createSignal<string[]>([])
  const [searching, setSearching] = createSignal(false)
  const [newFolderName, setNewFolderName] = createSignal("")
  const [creating, setCreating] = createSignal(false)

  const client = createOpencodeClient({ baseUrl: serverUrl, throwOnError: false })

  onMount(async () => {
    try {
      const res = await client.path.get()
      if (res.data?.home) {
        setHomeDirectory(res.data.home)
      }
    } catch (e) {
      console.error("Failed to fetch path info:", e)
    }
  })

  async function searchFolders(query: string) {
    const home = homeDirectory()
    if (!query.trim() || !home) {
      setSearchResults([])
      return
    }

    setSearching(true)
    try {
      const res = await client.find.files({
        directory: home,
        query: query,
        type: "directory",
        limit: 20,
      })
      const results = res.data ?? []
      setSearchResults(results.map((r) => `${home}/${r}`.replace(/\/+/g, "/")))
    } catch (e) {
      console.error("Failed to search folders:", e)
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  function selectProject(path: string) {
    props.onSelect(path)
    props.onClose()
    // Reset state
    setFolderPath("")
    setFolderSearch("")
    setSearchResults([])
    setNewFolderName("")
  }

  async function createFolder() {
    const home = homeDirectory()
    const name = newFolderName().trim()
    if (!name || !home || creating()) return

    const fullPath = `${home}/${name}`.replace(/\/+/g, "/")

    setCreating(true)
    try {
      // Actually create the directory on the server
      const res = await client.file.mkdir({ path: fullPath })
      if (res.data) {
        selectProject(fullPath)
      } else {
        console.error("Failed to create directory:", res.error)
      }
    } catch (e) {
      console.error("Failed to create directory:", e)
    } finally {
      setCreating(false)
    }
  }

  function openFolderPath() {
    const path = folderPath().trim()
    if (path) {
      selectProject(path)
    }
  }

  // Handle escape key
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      props.onClose()
    }
  }

  return (
    <Show when={props.open}>
      {/* Backdrop */}
      <div
        class="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: "rgba(0, 0, 0, 0.5)" }}
        onClick={() => props.onClose()}
        onKeyDown={handleKeyDown}
      >
        {/* Dialog */}
        <div
          class="w-full max-w-md mx-4 rounded-xl shadow-2xl"
          style={{ background: "var(--background-base)", border: "1px solid var(--border-base)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            class="flex items-center justify-between p-4"
            style={{ "border-bottom": "1px solid var(--border-base)" }}
          >
            <h2 class="text-lg font-semibold" style={{ color: "var(--text-strong)" }}>
              Open Project
            </h2>
            <button
              onClick={() => props.onClose()}
              class="p-1 rounded-md transition-colors"
              style={{ color: "var(--icon-base)" }}
            >
              <X class="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div class="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Search for folder */}
            <div>
              <label class="block text-sm font-medium mb-2" style={{ color: "var(--text-strong)" }}>
                Search for a folder
              </label>
              <input
                type="text"
                value={folderSearch()}
                onInput={(e) => {
                  setFolderSearch(e.currentTarget.value)
                  searchFolders(e.currentTarget.value)
                }}
                placeholder={`Type to search in ${homeDirectory() ?? "..."}...`}
                class="w-full px-3 py-2 rounded-md text-sm"
                style={{
                  background: "var(--background-stronger)",
                  border: "1px solid var(--border-base)",
                  color: "var(--text-base)",
                }}
              />

              <Show when={searching()}>
                <div class="flex items-center justify-center py-4">
                  <Spinner class="w-5 h-5" style={{ color: "var(--text-interactive-base)" }} />
                </div>
              </Show>

              <Show when={!searching() && searchResults().length > 0}>
                <div class="mt-2 space-y-1 max-h-48 overflow-y-auto">
                  <For each={searchResults()}>
                    {(path) => (
                      <button
                        onClick={() => selectProject(path)}
                        class="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors"
                        style={{ color: "var(--text-base)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-inset)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <Folder class="w-4 h-4 shrink-0" />
                        <span class="truncate">{path}</span>
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>

            {/* Direct path input */}
            <div>
              <label class="block text-sm font-medium mb-2" style={{ color: "var(--text-strong)" }}>
                Or enter path directly
              </label>
              <div class="flex gap-2">
                <input
                  type="text"
                  value={folderPath()}
                  onInput={(e) => setFolderPath(e.currentTarget.value)}
                  placeholder="/home/jovyan/my-project"
                  class="flex-1 px-3 py-2 rounded-md text-sm"
                  style={{
                    background: "var(--background-stronger)",
                    border: "1px solid var(--border-base)",
                    color: "var(--text-base)",
                  }}
                  onKeyDown={(e) => e.key === "Enter" && openFolderPath()}
                />
                <Button onClick={openFolderPath} variant="primary" disabled={!folderPath().trim()}>
                  Open
                </Button>
              </div>
            </div>

            {/* Create new folder */}
            <div>
              <label class="block text-sm font-medium mb-2" style={{ color: "var(--text-strong)" }}>
                Create new folder
              </label>
              <div class="flex gap-2">
                <input
                  type="text"
                  value={newFolderName()}
                  onInput={(e) => setNewFolderName(e.currentTarget.value)}
                  placeholder="my-new-project"
                  class="flex-1 px-3 py-2 rounded-md text-sm"
                  style={{
                    background: "var(--background-stronger)",
                    border: "1px solid var(--border-base)",
                    color: "var(--text-base)",
                  }}
                  onKeyDown={(e) => e.key === "Enter" && createFolder()}
                />
                <Button onClick={createFolder} variant="primary" disabled={!newFolderName().trim() || creating()}>
                  <Show when={creating()} fallback="Create">
                    <Spinner class="w-4 h-4" />
                  </Show>
                </Button>
              </div>
              <Show when={newFolderName().trim() && homeDirectory()}>
                <p class="mt-2 text-xs" style={{ color: "var(--text-weak)" }}>
                  Will open: {homeDirectory()}/{newFolderName()}
                </p>
              </Show>
            </div>

            {/* Quick access to home directory */}
            <Show when={homeDirectory()}>
              <div class="pt-2" style={{ "border-top": "1px solid var(--border-base)" }}>
                <button
                  onClick={() => selectProject(homeDirectory()!)}
                  class="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors"
                  style={{ color: "var(--text-interactive-base)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-inset)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <Folder class="w-4 h-4 shrink-0" />
                  <span>Open home directory ({homeDirectory()})</span>
                </button>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  )
}
