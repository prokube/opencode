import { createSignal, For, Show, onMount } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import { useBasePath } from "../context/base-path"
import { base64Encode } from "../utils/path"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Button } from "@opencode-ai/ui/button"

// OpenCode Logo
function OpenCodeLogo(props: { class?: string }) {
  return (
    <svg class={props.class} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="20" fill="currentColor" />
      <path d="M30 35L45 50L30 65" stroke="white" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M55 65H70" stroke="white" stroke-width="8" stroke-linecap="round" />
    </svg>
  )
}

// Prokube Logo
function ProkubeLogo(props: { class?: string }) {
  return (
    <svg class={props.class} viewBox="0 0 73.87881 73.87876" xmlns="http://www.w3.org/2000/svg">
      <path d="m73.87881,0H0v73.87876h73.87881V0h0Z" fill="#08000e" />
      <rect x="61.72833" y="27.10204" width="5.55266" height="5.55266" fill="#fff" />
      <path
        d="m6.59779,67.28097v-34.21636h19.11633c1.07361,0,2.05576.26894,2.94586.80538.89015.53706,1.59612,1.24374,2.11935,2.11935.52256.87621.78415,1.85102.78415,2.92463v12.88551c0,1.07422-.26159,2.04913-.78415,2.92473-.52323.87621-1.2292,1.5828-2.11935,2.11924-.8901.53706-1.87225.80528-2.94586.80528h-13.56367v9.63224h-5.55266Zm6.06129-15.18479h12.8431c.1411,0,.26098-.04899.36028-.1483.0987-.0987.14835-.21862.14835-.36028v-12.46164c0-.14115-.04965-.26098-.14835-.36028-.09931-.0987-.21918-.1484-.36028-.1484h-12.8431c-.14177,0-.26164.0497-.36028.1484-.09936.09931-.14835.21913-.14835.36028v12.46164c0,.14166.04899.26159.14835.36028.09864.09931.21852.1483.36028.1483Z"
        fill="#fff"
      />
      <path
        d="m34.55118,57.64873V23.43238h5.55266v19.12689h4.36581l8.77398-9.49465h5.93412v1.52595l-9.7913,10.76616,9.74894,10.76616v1.52585h-5.89176l-8.77398-9.49445h-4.36581v9.49445h-5.55266Z"
        fill="#fff"
      />
    </svg>
  )
}

function FolderIcon(props: { class?: string }) {
  return (
    <svg class={props.class} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    </svg>
  )
}

/**
 * Project picker content - shown inside HomeLayout.
 * Displays OpenCode logo and folder selection options.
 */
export function ProjectPicker() {
  const { serverUrl } = useBasePath()
  const navigate = useNavigate()

  const [homeDirectory, setHomeDirectory] = createSignal<string | null>(null)
  const [folderPath, setFolderPath] = createSignal("")
  const [folderSearch, setFolderSearch] = createSignal("")
  const [searchResults, setSearchResults] = createSignal<string[]>([])
  const [searching, setSearching] = createSignal(false)
  const [newFolderName, setNewFolderName] = createSignal("")

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

  function selectProject(worktree: string) {
    navigate(`/${base64Encode(worktree)}/session`)
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

  function createFolder() {
    const home = homeDirectory()
    const name = newFolderName().trim()
    if (!name || !home) return
    const fullPath = `${home}/${name}`.replace(/\/+/g, "/")
    selectProject(fullPath)
  }

  function openFolderPath() {
    const path = folderPath().trim()
    if (path) {
      selectProject(path)
    }
  }

  return (
    <div class="flex-1 flex items-center justify-center p-6">
      <div class="w-full max-w-md">
        {/* Logo and Title */}
        <div class="text-center mb-8">
          <div class="flex justify-center mb-4">
            <OpenCodeLogo class="w-20 h-20" style={{ color: "var(--interactive-base)" }} />
          </div>
          <h1 class="text-2xl font-semibold mb-2" style={{ color: "var(--text-strong)" }}>
            OpenCode
          </h1>
          <div class="flex items-center justify-center gap-2 mb-3" style={{ color: "var(--text-weak)" }}>
            <span>Powered by</span>
            <a
              href="https://prokube.ai"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 transition-opacity hover:opacity-80"
            >
              <ProkubeLogo class="w-5 h-5 rounded" />
              <span class="font-medium" style={{ color: "var(--text-strong)" }}>
                Prokube
              </span>
            </a>
          </div>
          <p style={{ color: "var(--text-weak)" }}>Choose a folder to start working</p>
        </div>

        {/* Search for folder */}
        <div
          class="mb-4 p-4 rounded-lg"
          style={{ background: "var(--background-base)", border: "1px solid var(--border-base)" }}
        >
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
                    <FolderIcon class="w-4 h-4 shrink-0" style={{ color: "var(--icon-weak)" }} />
                    <span class="truncate">{path}</span>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>

        {/* Direct path input */}
        <div
          class="mb-4 p-4 rounded-lg"
          style={{ background: "var(--background-base)", border: "1px solid var(--border-base)" }}
        >
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
        <div
          class="mb-4 p-4 rounded-lg"
          style={{ background: "var(--background-base)", border: "1px solid var(--border-base)" }}
        >
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
            <Button onClick={createFolder} variant="primary" disabled={!newFolderName().trim()}>
              Create
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
          <div class="text-center">
            <button
              onClick={() => selectProject(homeDirectory()!)}
              class="text-sm transition-colors"
              style={{ color: "var(--text-interactive-base)" }}
              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
            >
              Open home directory ({homeDirectory()})
            </button>
          </div>
        </Show>
      </div>
    </div>
  )
}
