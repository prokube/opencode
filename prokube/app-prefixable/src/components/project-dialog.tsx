import { createSignal, For, Show, onMount, createEffect } from "solid-js"
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import { useBasePath } from "../context/base-path"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Button } from "@opencode-ai/ui/button"
import { Folder, X, GitBranch, AlertCircle } from "lucide-solid"

type DialogView = "browse" | "clone"

interface ProjectDialogProps {
  open: boolean
  onClose: () => void
  onSelect: (worktree: string) => void
  initialView?: DialogView
}

export function ProjectDialog(props: ProjectDialogProps) {
  const { serverUrl } = useBasePath()

  const [homeDirectory, setHomeDirectory] = createSignal<string | null>(null)
  const [homeFolders, setHomeFolders] = createSignal<string[]>([])
  const [homeFoldersLoaded, setHomeFoldersLoaded] = createSignal(false)
  const [loadingHome, setLoadingHome] = createSignal(false)
  const [folderSearch, setFolderSearch] = createSignal("")
  const [searchResults, setSearchResults] = createSignal<string[]>([])
  const [searching, setSearching] = createSignal(false)
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [newFolderName, setNewFolderName] = createSignal("")
  const [creating, setCreating] = createSignal(false)

  // Git clone state
  const [showCloneForm, setShowCloneForm] = createSignal(false)
  const [repoUrl, setRepoUrl] = createSignal("")
  const [cloning, setCloning] = createSignal(false)
  const [cloneError, setCloneError] = createSignal<string | null>(null)

  const client = createOpencodeClient({ baseUrl: serverUrl, throwOnError: false })

  // Load home directory on mount
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

  // Load home folders when dialog opens or home directory changes
  createEffect(() => {
    const home = homeDirectory()
    if (props.open && home && !homeFoldersLoaded()) {
      loadHomeFolders(home)
    }
  })

  // Set initial view when dialog opens
  createEffect(() => {
    if (props.open) {
      setShowCloneForm(props.initialView === "clone")
    }
  })

  async function loadHomeFolders(home: string) {
    setLoadingHome(true)
    try {
      // Use find.files with a space query to list all directories
      // (empty query doesn't work, but space returns all results)
      const res = await client.find.files({
        directory: home,
        query: " ",
        type: "directory",
        limit: 50,
      })
      const results = res.data ?? []
      // Filter to only show top-level directories (no nested paths)
      const topLevel = results.filter((r) => !r.includes("/")).map((r) => `${home}/${r}`.replace(/\/+/g, "/"))
      setHomeFolders(topLevel)
    } catch (e) {
      console.error("Failed to load home folders:", e)
      setHomeFolders([])
    } finally {
      setHomeFoldersLoaded(true)
      setLoadingHome(false)
    }
  }

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
    setFolderSearch("")
    setSearchResults([])
    setNewFolderName("")
    setShowCloneForm(false)
    setRepoUrl("")
    setCloneError(null)
  }

  async function createFolder() {
    const home = homeDirectory()
    const name = newFolderName().trim()
    if (!name || !home || creating()) return

    const fullPath = `${home}/${name}`.replace(/\/+/g, "/")

    setCreating(true)
    try {
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

  async function cloneRepo() {
    const home = homeDirectory()
    const url = repoUrl().trim()
    if (!url || !home || cloning()) return

    setCloning(true)
    setCloneError(null)

    try {
      // Extract repo name from URL for the target directory
      const repoName = url
        .split("/")
        .pop()
        ?.replace(/\.git$/, "")
      if (!repoName) {
        setCloneError("Invalid repository URL")
        setCloning(false)
        return
      }

      const targetPath = `${home}/${repoName}`.replace(/\/+/g, "/")

      // Use PTY to run git clone - create a session with the clone command
      const res = await client.pty.create({
        command: "git",
        args: ["clone", url, targetPath],
        cwd: home,
      })

      if (res.data?.id) {
        const ptyId = res.data.id

        // Wait for clone to complete (poll for completion)
        let attempts = 0
        const maxAttempts = 120 // 2 minutes max

        while (attempts < maxAttempts) {
          await new Promise((r) => setTimeout(r, 1000))
          attempts++

          // Try to get PTY status to check if it's done
          try {
            const getRes = await client.pty.get({ ptyID: ptyId })
            const pty = getRes.data

            // Check if PTY has exited
            if (pty?.status === "exited") {
              // Check if directory was created (success indicator)
              try {
                await client.file.list({ path: targetPath })
                // Directory exists - clone succeeded
                await client.pty.remove({ ptyID: ptyId }).catch(() => {})
                await loadHomeFolders(home)
                selectProject(targetPath)
                return
              } catch {
                // Directory doesn't exist - clone failed
                setCloneError("Clone failed - check repository URL and credentials")
                await client.pty.remove({ ptyID: ptyId }).catch(() => {})
                setCloning(false)
                return
              }
            }
          } catch {
            // PTY might have been removed, check if directory exists
            break
          }
        }

        // If we get here, try to select the project anyway (clone might have succeeded)
        await client.pty.remove({ ptyID: ptyId }).catch(() => {})

        // Check if clone succeeded by checking if directory exists
        try {
          await client.file.list({ path: targetPath })
          await loadHomeFolders(home)
          selectProject(targetPath)
        } catch {
          setCloneError("Clone timed out or failed")
          setCloning(false)
        }
      } else {
        setCloneError("Failed to start git clone")
        setCloning(false)
      }
    } catch (e) {
      console.error("Failed to clone repository:", e)
      setCloneError(e instanceof Error ? e.message : "Clone failed")
      setCloning(false)
    }
  }

  // Handle escape key
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (showCloneForm()) {
        setShowCloneForm(false)
        setCloneError(null)
      } else {
        props.onClose()
      }
    }
  }

  // Folders to display - search results or home folders
  const displayFolders = () => {
    if (folderSearch().trim()) {
      return searchResults()
    }
    return homeFolders()
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
              {showCloneForm() ? "Clone Git Repository" : "Open Project"}
            </h2>
            <button
              onClick={() => (showCloneForm() ? setShowCloneForm(false) : props.onClose())}
              class="p-1 rounded-md transition-colors"
              style={{ color: "var(--icon-base)" }}
            >
              <X class="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div class="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
            <Show when={!showCloneForm()}>
              {/* Search for folder */}
              <div>
                <label class="block text-sm font-medium mb-2" style={{ color: "var(--text-strong)" }}>
                  Search or select a folder
                </label>
                <input
                  type="text"
                  value={folderSearch()}
                  onInput={(e) => {
                    setFolderSearch(e.currentTarget.value)
                    setSelectedIndex(0)
                    searchFolders(e.currentTarget.value)
                  }}
                  onKeyDown={(e) => {
                    const folders = displayFolders()
                    if (folders.length === 0) return
                    if (e.key === "ArrowDown") {
                      e.preventDefault()
                      const newIndex = Math.min(selectedIndex() + 1, folders.length - 1)
                      setSelectedIndex(newIndex)
                      document
                        .querySelector(`[data-dialog-folder-index="${newIndex}"]`)
                        ?.scrollIntoView({ block: "nearest" })
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault()
                      const newIndex = Math.max(selectedIndex() - 1, 0)
                      setSelectedIndex(newIndex)
                      document
                        .querySelector(`[data-dialog-folder-index="${newIndex}"]`)
                        ?.scrollIntoView({ block: "nearest" })
                    } else if (e.key === "Enter") {
                      e.preventDefault()
                      const selected = folders[selectedIndex()]
                      if (selected) selectProject(selected)
                    }
                  }}
                  placeholder="Type to search... (use arrow keys to navigate)"
                  class="w-full px-3 py-2 rounded-md text-sm"
                  style={{
                    background: "var(--background-stronger)",
                    border: "1px solid var(--border-base)",
                    color: "var(--text-base)",
                  }}
                />

                {/* Fixed min height to prevent upward jumping */}
                <div class="mt-2 max-h-64 overflow-y-auto" style={{ "min-height": "16rem" }}>
                  <Show when={searching() || loadingHome()}>
                    <div class="flex items-center justify-center h-full">
                      <Spinner class="w-5 h-5" style={{ color: "var(--text-interactive-base)" }} />
                    </div>
                  </Show>

                  <Show when={!searching() && !loadingHome()}>
                    <div class="space-y-1">
                      <Show when={displayFolders().length === 0 && !folderSearch().trim()}>
                        <div class="px-3 py-2 text-sm" style={{ color: "var(--text-weak)" }}>
                          No folders found in home directory
                        </div>
                      </Show>
                      <Show when={displayFolders().length === 0 && folderSearch().trim()}>
                        <div class="px-3 py-2 text-sm" style={{ color: "var(--text-weak)" }}>
                          No folders match "{folderSearch()}"
                        </div>
                      </Show>
                      <For each={displayFolders()}>
                        {(path, index) => (
                          <button
                            data-dialog-folder-index={index()}
                            onClick={() => selectProject(path)}
                            class="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors"
                            style={{
                              color: "var(--text-base)",
                              background: index() === selectedIndex() ? "var(--surface-inset)" : "transparent",
                            }}
                            onMouseEnter={() => setSelectedIndex(index())}
                          >
                            <Folder class="w-4 h-4 shrink-0" style={{ color: "var(--icon-base)" }} />
                            <span class="truncate">{path.replace(homeDirectory() + "/", "")}</span>
                          </button>
                        )}
                      </For>
                    </div>
                  </Show>
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
                    Will create: {homeDirectory()}/{newFolderName()}
                  </p>
                </Show>
              </div>

              {/* Clone Git Repo button */}
              <div class="pt-2" style={{ "border-top": "1px solid var(--border-base)" }}>
                <button
                  onClick={() => setShowCloneForm(true)}
                  class="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors"
                  style={{ color: "var(--text-interactive-base)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-inset)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <GitBranch class="w-4 h-4 shrink-0" />
                  <span>Clone Git Repository</span>
                </button>
              </div>

              {/* Quick access to home directory */}
              <Show when={homeDirectory()}>
                <div>
                  <button
                    onClick={() => selectProject(homeDirectory()!)}
                    class="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors"
                    style={{ color: "var(--text-weak)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-inset)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <Folder class="w-4 h-4 shrink-0" />
                    <span>Open home directory directly</span>
                  </button>
                </div>
              </Show>
            </Show>

            {/* Clone form */}
            <Show when={showCloneForm()}>
              <div class="space-y-4">
                {/* Info about private repos */}
                <div
                  class="flex items-start gap-2 p-3 rounded-md text-sm"
                  style={{ background: "var(--surface-inset)", color: "var(--text-base)" }}
                >
                  <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--icon-warning-base)" }} />
                  <div>
                    <p class="font-medium" style={{ color: "var(--text-strong)" }}>
                      Private repositories
                    </p>
                    <p class="mt-1" style={{ color: "var(--text-weak)" }}>
                      To clone private repositories, first configure your Git credentials (SSH key) in Settings.
                    </p>
                  </div>
                </div>

                {/* Repo URL input */}
                <div>
                  <label class="block text-sm font-medium mb-2" style={{ color: "var(--text-strong)" }}>
                    Repository URL
                  </label>
                  <input
                    type="text"
                    value={repoUrl()}
                    onInput={(e) => {
                      setRepoUrl(e.currentTarget.value)
                      setCloneError(null)
                    }}
                    placeholder="https://github.com/user/repo.git or git@github.com:user/repo.git"
                    class="w-full px-3 py-2 rounded-md text-sm"
                    style={{
                      background: "var(--background-stronger)",
                      border: "1px solid var(--border-base)",
                      color: "var(--text-base)",
                    }}
                    onKeyDown={(e) => e.key === "Enter" && cloneRepo()}
                  />
                </div>

                {/* Error message */}
                <Show when={cloneError()}>
                  <div
                    class="px-3 py-2 rounded-md text-sm"
                    style={{ background: "var(--status-danger-dim)", color: "var(--status-danger-text)" }}
                  >
                    {cloneError()}
                  </div>
                </Show>

                {/* Clone target info */}
                <Show when={repoUrl().trim() && homeDirectory()}>
                  <p class="text-xs" style={{ color: "var(--text-weak)" }}>
                    Will clone to: {homeDirectory()}/
                    {repoUrl()
                      .split("/")
                      .pop()
                      ?.replace(/\.git$/, "") || "..."}
                  </p>
                </Show>

                {/* Actions */}
                <div class="flex gap-2">
                  <Button onClick={() => setShowCloneForm(false)} variant="secondary" class="flex-1">
                    Back
                  </Button>
                  <Button
                    onClick={cloneRepo}
                    variant="primary"
                    class="flex-1"
                    disabled={!repoUrl().trim() || cloning()}
                  >
                    <Show when={cloning()} fallback="Clone">
                      <div class="flex items-center gap-2">
                        <Spinner class="w-4 h-4" />
                        <span>Cloning...</span>
                      </div>
                    </Show>
                  </Button>
                </div>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  )
}
