import { createSignal, For, Show, onMount, createEffect, onCleanup } from "solid-js"
import { createOpencodeClient, type Event } from "@opencode-ai/sdk/v2/client"
import { useBasePath } from "../context/base-path"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Button } from "@opencode-ai/ui/button"
import { Folder, X, GitBranch, AlertCircle } from "lucide-solid"
import { Terminal } from "./terminal"
import { useEvents } from "../context/events"
import { mkdir, listDirs } from "../utils/prokube-api"

type DialogView = "browse" | "clone"

interface ProjectDialogProps {
  open: boolean
  onClose: () => void
  onSelect: (worktree: string) => void
  initialView?: DialogView
}

export function ProjectDialog(props: ProjectDialogProps) {
  const { serverUrl } = useBasePath()
  const events = useEvents()

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
  const [clonePtyId, setClonePtyId] = createSignal<string | null>(null)
  const [cloneSuccess, setCloneSuccess] = createSignal(false)
  const [cloneTargetPath, setCloneTargetPath] = createSignal<string | null>(null)

  const client = createOpencodeClient({ baseUrl: serverUrl, throwOnError: false })
  // Global client without directory context - for PTY operations
  const global = createOpencodeClient({ baseUrl: serverUrl, throwOnError: false })

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
      // Use prokube API to list directories (2 levels deep)
      const results = await listDirs(serverUrl, home, { limit: 50 })
      // Filter to only show top-level directories (no nested paths)
      const topLevel = results
        .map((r: string) => r.replace(/\/$/, "")) // Remove trailing slash
        .filter((r: string) => !r.includes("/")) // Only top-level
        .map((r: string) => `${home}/${r}`.replace(/\/+/g, "/"))
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
      // Use prokube API to search directories
      const results = await listDirs(serverUrl, home, { query, limit: 20 })
      setSearchResults(results.map((r: string) => `${home}/${r}`.replace(/\/+/g, "/")))
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
      // Use prokube API to create directory
      const success = await mkdir(serverUrl, fullPath)
      if (success) {
        selectProject(fullPath)
      } else {
        console.error("Failed to create directory")
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

    // Extract repo name from URL for the target directory
    const repoName = url
      .split("/")
      .pop()
      ?.replace(/\.git$/, "")
    if (!repoName) {
      setCloneError("Invalid repository URL")
      return
    }

    const targetPath = `${home}/${repoName}`.replace(/\/+/g, "/")

    setCloning(true)
    setCloneError(null)
    setCloneSuccess(false)
    setCloneTargetPath(targetPath)

    try {
      // Use global PTY to run git clone (no directory context)
      const res = await global.pty.create({
        command: "git",
        args: ["clone", url, targetPath],
        cwd: home,
      })

      if (!res.data?.id) {
        setCloneError("Failed to start git clone")
        setCloning(false)
        return
      }

      const ptyId = res.data.id
      setClonePtyId(ptyId)
      console.log("[CloneRepo] Waiting for PTY exit event:", ptyId)

      // Listen for pty.exited event to detect when git clone completes
      const handlePtyExit = async (event: Event) => {
        if (event.type === "pty.exited" && event.properties?.id === ptyId) {
          const exitCode = event.properties?.exitCode as number
          console.log("[CloneRepo] PTY exited with code:", exitCode)
          
          setCloning(false)
          
          // Check exit code: 0 = success, anything else = failure
          if (exitCode === 0) {
            console.log("[CloneRepo] Clone succeeded! Setting success state")
            setCloneSuccess(true)
            await loadHomeFolders(home)
            console.log("[CloneRepo] Done!")
          } else {
            console.log("[CloneRepo] Clone failed with exit code:", exitCode)
            setCloneError(`Clone failed with exit code ${exitCode}. Check the terminal output for details.`)
          }
        }
      }
      
      // Subscribe to events and cleanup on unmount
      const unsubscribe = events.subscribe(handlePtyExit)
      onCleanup(unsubscribe)
    } catch (e) {
      console.error("Failed to clone repository:", e)
      setCloneError(e instanceof Error ? e.message : "Clone failed")
      setCloning(false)
    }
  }

  async function cancelClone() {
    const ptyId = clonePtyId()
    if (!ptyId) return

    try {
      await global.pty.remove({ ptyID: ptyId })
      setClonePtyId(null)
      setCloning(false)
      setCloneError("Clone cancelled")
    } catch (e) {
      console.error("Failed to cancel clone:", e)
    }
  }

  async function openClonedProject() {
    const targetPath = cloneTargetPath()
    if (!targetPath) return
    selectProject(targetPath)
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
                <Show when={repoUrl().trim() && homeDirectory() && !clonePtyId()}>
                  <p class="text-xs" style={{ color: "var(--text-weak)" }}>
                    Will clone to: {homeDirectory()}/
                    {repoUrl()
                      .split("/")
                      .pop()
                      ?.replace(/\.git$/, "") || "..."}
                  </p>
                </Show>

                {/* Terminal Output */}
                <Show when={clonePtyId()}>
                  <div
                    class="rounded-md overflow-hidden"
                    style={{
                      border: "1px solid var(--border-base)",
                      height: "300px",
                    }}
                  >
                    <Terminal ptyId={clonePtyId()!} />
                  </div>
                </Show>

                {/* Success message */}
                <Show when={cloneSuccess()}>
                  <div
                    class="px-3 py-2 rounded-md text-sm"
                    style={{ background: "var(--status-success-dim)", color: "var(--status-success-text)" }}
                  >
                    ✓ Repository cloned successfully!
                  </div>
                </Show>

                {/* Actions */}
                <div class="flex gap-2">
                  <Show
                    when={cloneSuccess()}
                    fallback={
                      <>
                        <Button
                          onClick={() => {
                            setShowCloneForm(false)
                            setClonePtyId(null)
                            setCloneError(null)
                            setCloneSuccess(false)
                          }}
                          variant="secondary"
                          class="flex-1"
                          disabled={cloning()}
                        >
                          Back
                        </Button>
                        <Show when={cloning()}>
                          <Button onClick={cancelClone} variant="secondary" class="flex-1">
                            Cancel Clone
                          </Button>
                        </Show>
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
                      </>
                    }
                  >
                    {/* Success state buttons */}
                    <Button
                      onClick={() => {
                        setShowCloneForm(false)
                        setClonePtyId(null)
                        setCloneError(null)
                        setCloneSuccess(false)
                        setRepoUrl("")
                      }}
                      variant="secondary"
                      class="flex-1"
                    >
                      Clone Another
                    </Button>
                    <Button onClick={openClonedProject} variant="primary" class="flex-1">
                      Open Project
                    </Button>
                  </Show>
                </div>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  )
}
