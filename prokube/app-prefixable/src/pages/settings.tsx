import { createSignal, For, Show, type JSX, createMemo, onMount } from "solid-js"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useProviders } from "../context/providers"
import { useMCP } from "../context/mcp"
import { useSDK } from "../context/sdk"
import { MCPAddDialog } from "../components/mcp-add-dialog"
import { Button } from "../components/ui/button"
import { Check, Copy, Plug, GitBranch, Server, ExternalLink, Key, Search, X, Plus, Trash2 } from "lucide-solid"

export function Settings() {
  const providers = useProviders()
  const mcp = useMCP()
  const { client, global, url, directory } = useSDK()
  const [selectedProvider, setSelectedProvider] = createSignal<string | null>(null)
  const [apiKey, setApiKey] = createSignal("")
  const [connecting, setConnecting] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [success, setSuccess] = createSignal<string | null>(null)
  // Initialize tab from URL hash, default to "providers"
  const getInitialTab = () => {
    const hash = window.location.hash.slice(1)
    const validTabs = ["providers", "git", "mcp"]
    return validTabs.includes(hash) ? hash : "providers"
  }
  const [activeTab, setActiveTab] = createSignal(getInitialTab())
  const [showMCPAddDialog, setShowMCPAddDialog] = createSignal(false)
  const [mcpLoading, setMcpLoading] = createSignal<string | null>(null)
  const [mcpDeleting, setMcpDeleting] = createSignal<string | null>(null)

  // Provider search
  const [providerSearch, setProviderSearch] = createSignal("")

  // OAuth state
  const [oauthPending, setOauthPending] = createSignal<{
    providerID: string
    providerName: string
    methodIndex: number
    method: "auto" | "code"
    instructions: string
    code: string // Extracted code from instructions (e.g., "XXXX-YYYY")
  } | null>(null)
  const [oauthCode, setOauthCode] = createSignal("")
  const [codeCopied, setCodeCopied] = createSignal(false)

  // Git SSH Key state
  const [sshKeys, setSshKeys] = createSignal<Array<{ name: string; content: string }>>([])
  const [selectedKeyName, setSelectedKeyName] = createSignal<string | null>(null)
  const [sshKeyLoading, setSshKeyLoading] = createSignal(false)
  const [sshKeyGenerating, setSshKeyGenerating] = createSignal(false)
  const [sshKeyError, setSshKeyError] = createSignal<string | null>(null)
  const [sshKeyCopied, setSshKeyCopied] = createSignal(false)
  const [sshKeyLoaded, setSshKeyLoaded] = createSignal(false)

  // SSH Key Import/Add state
  const [showAddKeyDialog, setShowAddKeyDialog] = createSignal(false)
  const [addKeyContent, setAddKeyContent] = createSignal("")
  const [addKeyPrivateContent, setAddKeyPrivateContent] = createSignal("")
  const [addKeyName, setAddKeyName] = createSignal("")
  const [addKeyError, setAddKeyError] = createSignal<string | null>(null)
  const [addKeyAdding, setAddKeyAdding] = createSignal(false)

  // SSH Key Remove state
  const [keyToRemove, setKeyToRemove] = createSignal<string | null>(null)
  const [removeKeyLoading, setRemoveKeyLoading] = createSignal(false)

  // Get auth methods for selected provider
  const selectedProviderAuthMethods = createMemo(() => {
    const id = selectedProvider()
    if (!id) return []
    return providers.authMethods[id] || []
  })

  // Popular providers shown first
  const popularProviders = ["opencode", "anthropic", "github-copilot", "openai", "google", "openrouter"]

  // Filtered and sorted providers for display
  const filteredProviders = createMemo(() => {
    const search = providerSearch().toLowerCase().trim()
    const unconnected = providers.providers.filter((p) => !providers.connected.includes(p.id))

    // Filter by search
    const filtered = search
      ? unconnected.filter((p) => p.name.toLowerCase().includes(search) || p.id.toLowerCase().includes(search))
      : unconnected

    // Sort: popular first, then alphabetically
    return filtered.sort((a, b) => {
      const aPopular = popularProviders.indexOf(a.id)
      const bPopular = popularProviders.indexOf(b.id)
      if (aPopular >= 0 && bPopular >= 0) return aPopular - bPopular
      if (aPopular >= 0) return -1
      if (bPopular >= 0) return 1
      return a.name.localeCompare(b.name)
    })
  })

  // Get currently selected key content
  const selectedKey = () => {
    const name = selectedKeyName()
    if (!name) return null
    return sshKeys().find((k) => k.name === name)?.content ?? null
  }

  // Load SSH key when Git tab is first accessed
  function onTabChange(tabId: string) {
    setActiveTab(tabId)
    // Persist tab in URL hash for refresh persistence
    window.history.replaceState(null, "", `#${tabId}`)
    if (tabId === "git" && !sshKeyLoaded()) {
      setSshKeyLoaded(true)
      loadSshKeys()
    }
  }

  // Load SSH keys on mount if starting on git tab
  onMount(() => {
    if (activeTab() === "git" && !sshKeyLoaded()) {
      setSshKeyLoaded(true)
      loadSshKeys()
    }
  })

  async function runPtyCommand(command: string, timeout = 5000): Promise<string> {
    console.log("[runPtyCommand] Starting with command:", command)
    try {
      // Create PTY that directly runs the command via sh -c
      // Add a sleep at the end to give us time to connect and read the output
      // The sleep keeps the process alive until we've read all data
      // cd to $HOME first to ensure we're in a valid directory for SSH operations
      const marker = `__DONE_${Date.now()}__`
      const fullCommand = `cd ~ && ${command}; echo "${marker}"; sleep 2`

      // Use global client (no directory header) to avoid project context issues
      // Use /usr/bin/env sh instead of /bin/sh to avoid the PTY code
      // appending -l flag which breaks -c execution
      // Use /tmp as cwd - it always exists and is writable
      const ptyRes = await global.pty.create({
        command: "/usr/bin/env",
        args: ["sh", "-c", fullCommand],
        cwd: "/tmp",
      })

      console.log("[runPtyCommand] PTY create response:", ptyRes)

      if (!ptyRes.data?.id) {
        console.error("[runPtyCommand] Failed to create PTY:", ptyRes)
        return ""
      }

      const ptyId = ptyRes.data.id
      const wsUrl = url.replace(/^http/, "ws") + `/pty/${ptyId}/connect`
      console.log("[runPtyCommand] Connecting to:", wsUrl)

      const output = await new Promise<string>((resolve) => {
        let data = ""
        const ws = new WebSocket(wsUrl)

        const timeoutId = setTimeout(() => {
          console.log("[runPtyCommand] Timeout reached. Data collected:", data)
          ws.close()
          resolve(data)
        }, timeout)

        ws.addEventListener("open", () => {
          console.log("[runPtyCommand] WebSocket connected")
        })

        ws.addEventListener("message", (event) => {
          console.log("[runPtyCommand] Received message:", event.data)
          data += event.data

          // Check if we got the completion marker
          if (data.includes(marker)) {
            console.log("[runPtyCommand] Marker found, closing")
            clearTimeout(timeoutId)
            ws.close()
            resolve(data)
          }
        })

        ws.addEventListener("close", () => {
          console.log("[runPtyCommand] WebSocket closed, total output length:", data.length)
          clearTimeout(timeoutId)
          resolve(data)
        })

        ws.addEventListener("error", (e) => {
          console.error("[runPtyCommand] WebSocket error:", e)
          clearTimeout(timeoutId)
          resolve(data)
        })
      })

      console.log("[runPtyCommand] Final output:", output)
      await global.pty.remove({ ptyID: ptyId }).catch(() => {})
      return output
    } catch (e) {
      console.error("[runPtyCommand] Error:", e)
      return ""
    }
  }

  // Strip ANSI escape codes from terminal output
  function stripAnsi(str: string): string {
    // eslint-disable-next-line no-control-regex
    return str.replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b\[\?[0-9;]*[a-zA-Z]/g, "")
  }

  async function loadSshKeys() {
    setSshKeyLoading(true)
    setSshKeyError(null)
    console.log("[loadSshKeys] Starting")
    try {
      // List all .pub files in ~/.ssh/
      const listOutput = await runPtyCommand("ls -1 ~/.ssh/*.pub 2>/dev/null")
      const cleanOutput = stripAnsi(listOutput)
      console.log("[loadSshKeys] Clean output:", cleanOutput)

      // Parse file names
      const files = cleanOutput
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.endsWith(".pub") && !line.includes("*"))

      console.log("[loadSshKeys] Found files:", files)

      if (files.length === 0) {
        setSshKeys([])
        setSelectedKeyName(null)
        return
      }

      // Read each key file
      const keys: Array<{ name: string; content: string }> = []
      for (const file of files) {
        const content = await runPtyCommand(`cat "${file}" 2>/dev/null`)
        const cleanContent = stripAnsi(content)
        const keyContent = cleanContent
          .split("\n")
          .find((line) => {
            const trimmed = line.trim()
            return trimmed.startsWith("ssh-") || trimmed.startsWith("ecdsa-")
          })
          ?.trim()

        console.log("[loadSshKeys] Key content for", file, ":", keyContent?.substring(0, 50))

        if (keyContent) {
          // Extract just the filename without path
          const name = file.split("/").pop()?.replace(".pub", "") || file
          keys.push({ name, content: keyContent })
        }
      }

      console.log(
        "[loadSshKeys] Loaded keys:",
        keys.map((k) => k.name),
      )
      console.log("[loadSshKeys] Setting sshKeys signal with", keys.length, "keys")
      setSshKeys(keys)
      console.log("[loadSshKeys] sshKeys() now has", sshKeys().length, "keys")

      // Select first key by default, or keep current selection if still valid
      const current = selectedKeyName()
      if (!current || !keys.find((k) => k.name === current)) {
        setSelectedKeyName(keys[0]?.name ?? null)
      }
    } catch (e) {
      console.error("[loadSshKeys] Failed to load SSH keys:", e)
      setSshKeyError("Failed to check for SSH keys")
    } finally {
      setSshKeyLoading(false)
    }
  }

  async function generateSshKey() {
    setSshKeyGenerating(true)
    setSshKeyError(null)
    console.log("[generateSshKey] Starting SSH key generation")
    try {
      // Find a unique key name if id_ed25519 already exists
      const existingKeys = sshKeys().map((k) => k.name)
      let keyName = "id_ed25519"
      let counter = 2
      while (existingKeys.includes(keyName)) {
        keyName = `id_ed25519_${counter}`
        counter++
      }
      console.log("[generateSshKey] Using key name:", keyName)

      // Generate new ed25519 key with unique name
      const cmd = `mkdir -p ~/.ssh && chmod 700 ~/.ssh && ssh-keygen -t ed25519 -f ~/.ssh/${keyName} -N "" -q && echo "KEY_GENERATED"`
      console.log("[generateSshKey] Running command:", cmd)
      const result = await runPtyCommand(cmd, 10000)
      console.log("[generateSshKey] Command result:", result)

      if (!result.includes("KEY_GENERATED")) {
        console.error("[generateSshKey] SSH key generation failed, output:", result)
        setSshKeyError("SSH key generation failed. Check browser console for details.")
        return
      }

      console.log("[generateSshKey] Key generated successfully, reloading keys")
      // Reload all keys and select the new one
      await loadSshKeys()
      setSelectedKeyName(keyName)
      console.log("[generateSshKey] Done")
    } catch (e) {
      console.error("[generateSshKey] Error:", e)
      setSshKeyError("Failed to generate SSH key: " + String(e))
    } finally {
      setSshKeyGenerating(false)
    }
  }

  async function copySshKey() {
    const key = selectedKey()
    if (!key) return
    try {
      await navigator.clipboard.writeText(key)
      setSshKeyCopied(true)
      setTimeout(() => setSshKeyCopied(false), 2000)
    } catch (e) {
      console.error("Failed to copy:", e)
    }
  }

  // Validate SSH public key and extract key name from comment
  function validateSshPublicKey(content: string): { valid: boolean; error?: string; suggestedName?: string } {
    const trimmed = content.trim()

    // Check if empty
    if (!trimmed) {
      return { valid: false, error: "Key content is empty" }
    }

    // Valid SSH key types
    const validTypes = [
      "ssh-rsa",
      "ssh-ed25519",
      "ecdsa-sha2-nistp256",
      "ecdsa-sha2-nistp384",
      "ecdsa-sha2-nistp521",
      "ssh-dss",
    ]

    // Remove any newlines (keys should be single line but users might paste with newlines)
    const singleLine = trimmed.replace(/\n/g, " ").replace(/\s+/g, " ")

    // Split into parts: <type> <base64-key> [comment]
    const parts = singleLine.split(" ")

    if (parts.length < 2) {
      return { valid: false, error: "Invalid SSH key format. Expected: <type> <key-data> [comment]" }
    }

    const keyType = parts[0]

    // Check if valid key type
    if (!validTypes.includes(keyType)) {
      return {
        valid: false,
        error: `Invalid SSH key type '${keyType}'. Supported types: ${validTypes.join(", ")}`,
      }
    }

    // Base64 validation (simplified - just check if it looks like base64)
    const keyData = parts[1]
    if (!/^[A-Za-z0-9+/]+=*$/.test(keyData)) {
      return { valid: false, error: "Invalid key data format" }
    }

    // Extract suggested name from comment (if present)
    let suggestedName = ""
    if (parts.length > 2) {
      // Comment is everything after type and key data
      const comment = parts.slice(2).join(" ")
      // Try to extract a reasonable name from the comment
      // e.g., "user@host" -> "user_host", "my key" -> "my_key"
      suggestedName = comment
        .replace(/@/g, "_at_")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .substring(0, 50) // Limit length
    }

    // Fallback to key type if no comment
    if (!suggestedName) {
      suggestedName = keyType.replace("ssh-", "").replace(/-/g, "_") + "_key"
    }

    return { valid: true, suggestedName }
  }

  // Validate SSH private key format
  function validateSshPrivateKey(content: string): { valid: boolean; error?: string } {
    const trimmed = content.trim()

    if (!trimmed) {
      return { valid: false, error: "Private key is empty" }
    }

    // Check for valid private key headers
    const validHeaders = [
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      "-----BEGIN RSA PRIVATE KEY-----",
      "-----BEGIN EC PRIVATE KEY-----",
      "-----BEGIN DSA PRIVATE KEY-----",
      "-----BEGIN PRIVATE KEY-----",
    ]

    const hasValidHeader = validHeaders.some((header) => trimmed.includes(header))
    if (!hasValidHeader) {
      return { valid: false, error: "Invalid private key format. Must start with a valid PEM header." }
    }

    // Check for matching footer
    const validFooters = [
      "-----END OPENSSH PRIVATE KEY-----",
      "-----END RSA PRIVATE KEY-----",
      "-----END EC PRIVATE KEY-----",
      "-----END DSA PRIVATE KEY-----",
      "-----END PRIVATE KEY-----",
    ]

    const hasValidFooter = validFooters.some((footer) => trimmed.includes(footer))
    if (!hasValidFooter) {
      return { valid: false, error: "Invalid private key format. Missing valid PEM footer." }
    }

    return { valid: true }
  }

  function openAddKeyDialog() {
    setAddKeyContent("")
    setAddKeyPrivateContent("")
    setAddKeyName("")
    setAddKeyError(null)
    setShowAddKeyDialog(true)
  }

  function closeAddKeyDialog() {
    setShowAddKeyDialog(false)
    setAddKeyContent("")
    setAddKeyPrivateContent("")
    setAddKeyName("")
    setAddKeyError(null)
  }

  // Validate and auto-detect name when content changes
  function handleAddKeyContentChange(content: string) {
    setAddKeyContent(content)
    setAddKeyError(null)

    if (!content.trim()) {
      setAddKeyName("")
      return
    }

    const result = validateSshPublicKey(content)
    if (result.valid && result.suggestedName) {
      setAddKeyName(result.suggestedName)
    } else if (!result.valid) {
      setAddKeyError(result.error || "Invalid SSH key")
    }
  }

  async function addExistingSshKey() {
    const publicContent = addKeyContent().trim()
    const privateContent = addKeyPrivateContent().trim()
    const keyName = addKeyName().trim()

    // Validate public key
    const publicValidation = validateSshPublicKey(publicContent)
    if (!publicValidation.valid) {
      setAddKeyError(publicValidation.error || "Invalid SSH public key")
      return
    }

    // Validate private key if provided
    if (privateContent) {
      const privateValidation = validateSshPrivateKey(privateContent)
      if (!privateValidation.valid) {
        setAddKeyError(privateValidation.error || "Invalid SSH private key")
        return
      }
    }

    if (!keyName) {
      setAddKeyError("Please provide a name for the key")
      return
    }

    // Check if key with this name already exists
    const existingKeys = sshKeys().map((k) => k.name)
    if (existingKeys.includes(keyName)) {
      setAddKeyError(`A key named '${keyName}' already exists. Please choose a different name.`)
      return
    }

    setAddKeyAdding(true)
    setAddKeyError(null)

    try {
      // Create .ssh directory first
      await runPtyCommand("mkdir -p ~/.ssh && chmod 700 ~/.ssh", 5000)

      // Save public key - use base64 encoding to avoid shell escaping issues
      const base64PublicContent = btoa(publicContent)
      const publicCmd = `echo "${base64PublicContent}" | base64 -d > ~/.ssh/${keyName}.pub && chmod 644 ~/.ssh/${keyName}.pub && echo "PUBLIC_KEY_ADDED"`

      console.log("[addExistingSshKey] Adding public key:", keyName)
      const publicResult = await runPtyCommand(publicCmd, 10000)

      if (!publicResult.includes("PUBLIC_KEY_ADDED")) {
        console.error("[addExistingSshKey] Failed to add public key, output:", publicResult)
        setAddKeyError("Failed to save SSH public key. Check browser console for details.")
        return
      }

      // Save private key if provided
      if (privateContent) {
        const base64PrivateContent = btoa(privateContent)
        const privateCmd = `echo "${base64PrivateContent}" | base64 -d > ~/.ssh/${keyName} && chmod 600 ~/.ssh/${keyName} && echo "PRIVATE_KEY_ADDED"`

        console.log("[addExistingSshKey] Adding private key:", keyName)
        const privateResult = await runPtyCommand(privateCmd, 10000)

        if (!privateResult.includes("PRIVATE_KEY_ADDED")) {
          console.error("[addExistingSshKey] Failed to add private key, output:", privateResult)
          // Clean up public key on failure
          await runPtyCommand(`rm -f ~/.ssh/${keyName}.pub`, 5000)
          setAddKeyError("Failed to save SSH private key. Check browser console for details.")
          return
        }
      }

      console.log("[addExistingSshKey] Key(s) added successfully, reloading keys")
      // Reload all keys and select the new one
      await loadSshKeys()
      setSelectedKeyName(keyName)

      // Close dialog
      closeAddKeyDialog()
      console.log("[addExistingSshKey] Done")
    } catch (e) {
      console.error("[addExistingSshKey] Error:", e)
      setAddKeyError("Failed to add SSH key: " + String(e))
    } finally {
      setAddKeyAdding(false)
    }
  }

  async function removeSshKey(keyName: string) {
    setRemoveKeyLoading(true)
    setSshKeyError(null)

    try {
      const cmd = `rm -f ~/.ssh/${keyName}.pub ~/.ssh/${keyName} && echo "KEY_REMOVED"`
      console.log("[removeSshKey] Removing key:", keyName)
      const result = await runPtyCommand(cmd, 10000)

      if (!result.includes("KEY_REMOVED")) {
        console.error("[removeSshKey] Failed to remove key, output:", result)
        setSshKeyError("Failed to remove SSH key")
        return
      }

      console.log("[removeSshKey] Key removed successfully, reloading keys")
      // Reload keys
      await loadSshKeys()

      // Clear selection if removed key was selected
      if (selectedKeyName() === keyName) {
        setSelectedKeyName(sshKeys()[0]?.name ?? null)
      }

      // Close confirmation dialog
      setKeyToRemove(null)
      console.log("[removeSshKey] Done")
    } catch (e) {
      console.error("[removeSshKey] Error:", e)
      setSshKeyError("Failed to remove SSH key: " + String(e))
    } finally {
      setRemoveKeyLoading(false)
    }
  }

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

  async function handleOAuthStart(providerID: string, methodIndex: number) {
    setError(null)
    setSuccess(null)

    const result = await providers.startOAuth(providerID, methodIndex)

    if (result) {
      // Extract code from instructions (e.g., "Enter code: XXXX-YYYY" -> "XXXX-YYYY")
      const codeMatch = result.instructions.match(/:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/i)
      const code = codeMatch ? codeMatch[1] : ""

      const providerName = getProviderDisplayName(providerID)

      if (result.method === "code") {
        // User needs to enter a code manually
        setOauthPending({
          providerID,
          providerName,
          methodIndex,
          method: "code",
          instructions: result.instructions,
          code,
        })
        // Open the authorization URL
        window.open(result.url, "_blank")
      } else {
        // Auto method (device flow) - show code immediately, then start polling
        setOauthPending({
          providerID,
          providerName,
          methodIndex,
          method: "auto",
          instructions: result.instructions,
          code,
        })

        // Open the authorization URL
        window.open(result.url, "_blank")

        // Start the callback immediately - it will poll until user authorizes
        // This call blocks until authorization succeeds or fails
        console.log("[OAuth] Starting auto callback for", providerID, "with code:", code)
        setConnecting(true)
        const ok = await providers.completeOAuth(providerID, methodIndex)
        console.log("[OAuth] Callback result:", ok)
        setConnecting(false)

        if (ok) {
          setSuccess(`Connected to ${providerName}!`)
          setOauthPending(null)
          setSelectedProvider(null)
          setProviderSearch("")
        } else {
          setError("Authentication failed or was cancelled. Please try again.")
          setOauthPending(null)
        }
      }
    } else {
      setError("Failed to start authentication.")
    }
  }

  async function handleOAuthComplete() {
    const pending = oauthPending()
    if (!pending) return

    setConnecting(true)
    setError(null)

    const code = pending.method === "code" ? oauthCode().trim() : undefined
    const ok = await providers.completeOAuth(pending.providerID, pending.methodIndex, code)

    setConnecting(false)

    if (ok) {
      setSuccess(`Connected to ${pending.providerName}!`)
      setOauthPending(null)
      setOauthCode("")
      setSelectedProvider(null)
      setProviderSearch("")
    } else {
      setError("Failed to complete authentication. Please try again.")
    }
  }

  function cancelOAuth() {
    setOauthPending(null)
    setOauthCode("")
    setCodeCopied(false)
    setConnecting(false)
  }

  async function copyCode() {
    const pending = oauthPending()
    if (!pending?.code) return
    try {
      await navigator.clipboard.writeText(pending.code)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    } catch (e) {
      console.error("Failed to copy code:", e)
    }
  }

  function getProviderDisplayName(id: string): string {
    const provider = providers.providers.find((p) => p.id === id)
    return provider?.name ?? id
  }

  const tabs: Array<{ id: string; label: string; icon: () => JSX.Element }> = [
    { id: "providers", label: "Providers", icon: () => <Plug class="w-4 h-4" /> },
    { id: "git", label: "Git", icon: () => <GitBranch class="w-4 h-4" /> },
    { id: "mcp", label: "MCP Servers", icon: () => <Server class="w-4 h-4" /> },
    // Model/Agent selection happens via /model and /agent slash commands
  ]

  return (
    <div class="h-full flex" style={{ background: "var(--background-stronger)" }}>
      {/* Tabs sidebar */}
      <div
        class="w-48 shrink-0 flex flex-col py-3 px-2"
        style={{
          background: "var(--background-base)",
          "border-right": "1px solid var(--border-base)",
        }}
      >
        <div class="text-xs font-medium uppercase tracking-wide px-3 py-2" style={{ color: "var(--text-weak)" }}>
          Settings
        </div>
        <div class="space-y-0.5">
          <For each={tabs}>
            {(tab) => (
              <button
                onClick={() => onTabChange(tab.id)}
                class="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left"
                style={{
                  color: activeTab() === tab.id ? "var(--text-interactive-base)" : "var(--text-base)",
                  background: activeTab() === tab.id ? "var(--surface-inset)" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (activeTab() !== tab.id) e.currentTarget.style.background = "var(--surface-inset)"
                }}
                onMouseLeave={(e) => {
                  if (activeTab() !== tab.id) e.currentTarget.style.background = "transparent"
                }}
              >
                {tab.icon()}
                {tab.label}
              </button>
            )}
          </For>
        </div>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-y-auto">
        <div class="max-w-2xl p-6 space-y-6">
          {/* Providers Tab */}
          <Show when={activeTab() === "providers"}>
            <div class="space-y-6">
              <header>
                <h1 class="text-lg font-medium" style={{ color: "var(--text-strong)" }}>
                  Providers
                </h1>
                <p class="text-sm mt-1" style={{ color: "var(--text-weak)" }}>
                  Connect AI providers to enable chat functionality
                </p>
              </header>

              {/* Connected Providers */}
              <section
                class="rounded-lg overflow-hidden"
                style={{
                  background: "var(--background-base)",
                  border: "1px solid var(--border-base)",
                }}
              >
                <div class="px-4 py-3" style={{ "border-bottom": "1px solid var(--border-base)" }}>
                  <h2 class="text-sm font-medium" style={{ color: "var(--text-strong)" }}>
                    Connected Providers
                  </h2>
                </div>
                <div class="p-4">
                  <Show when={providers.loading}>
                    <div class="flex items-center gap-2" style={{ color: "var(--text-weak)" }}>
                      <Spinner class="w-4 h-4" />
                      <span class="text-sm">Loading connected providers...</span>
                    </div>
                  </Show>

                  <Show when={!providers.loading && providers.connected.length === 0}>
                    <p class="text-sm" style={{ color: "var(--text-weak)" }}>
                      No providers connected yet.
                    </p>
                  </Show>

                  <Show when={!providers.loading && providers.connected.length > 0}>
                    <div class="space-y-2">
                      <For each={providers.connected}>
                        {(providerID) => (
                          <div
                            class="flex items-center justify-between p-3 rounded-md"
                            style={{ background: "var(--surface-inset)" }}
                          >
                            <div class="flex items-center gap-3">
                              <div class="w-6 h-6 bg-green-100 rounded flex items-center justify-center">
                                <Check class="w-3 h-3 text-green-600" />
                              </div>
                              <span class="text-sm font-medium" style={{ color: "var(--text-strong)" }}>
                                {getProviderDisplayName(providerID)}
                              </span>
                            </div>
                            <span class="text-xs" style={{ color: "var(--text-weak)" }}>
                              Connected
                            </span>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </section>

              {/* Add Provider */}
              <section
                class="rounded-lg overflow-hidden"
                style={{
                  background: "var(--background-base)",
                  border: "1px solid var(--border-base)",
                }}
              >
                <div class="px-4 py-3" style={{ "border-bottom": "1px solid var(--border-base)" }}>
                  <h2 class="text-sm font-medium" style={{ color: "var(--text-strong)" }}>
                    Add Provider
                  </h2>
                </div>
                <div class="p-4">
                  {/* Success/Error messages at top */}
                  <Show when={success()}>
                    <div class="mb-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded-md text-sm flex items-center justify-between">
                      <span>{success()}</span>
                      <button onClick={() => setSuccess(null)} class="ml-2">
                        <X class="w-4 h-4" />
                      </button>
                    </div>
                  </Show>

                  <Show when={error()}>
                    <div class="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-md text-sm flex items-center justify-between">
                      <span>{error()}</span>
                      <button onClick={() => setError(null)} class="ml-2">
                        <X class="w-4 h-4" />
                      </button>
                    </div>
                  </Show>

                  {/* OAuth Pending - show prominently at top */}
                  <Show when={oauthPending()}>
                    {(pending) => (
                      <div
                        class="mb-4 p-4 rounded-lg"
                        style={{
                          background: "var(--surface-inset)",
                          border: "1px solid var(--border-base)",
                        }}
                      >
                        <div class="flex items-center justify-between mb-3">
                          <span class="text-sm font-medium" style={{ color: "var(--text-strong)" }}>
                            Connecting to {pending().providerName}
                          </span>
                          <Show when={!connecting()}>
                            <button
                              onClick={cancelOAuth}
                              class="text-xs px-2 py-1 rounded"
                              style={{ color: "var(--text-weak)" }}
                            >
                              Cancel
                            </button>
                          </Show>
                        </div>

                        {/* Show the code prominently with copy button */}
                        <Show when={pending().code}>
                          <div class="mb-3">
                            <div class="text-xs mb-1" style={{ color: "var(--text-weak)" }}>
                              Enter this code on GitHub:
                            </div>
                            <div class="flex items-center gap-2">
                              <code
                                class="text-2xl font-mono font-bold tracking-wider px-4 py-2 rounded"
                                style={{
                                  background: "var(--background-base)",
                                  color: "var(--text-strong)",
                                  border: "1px solid var(--border-base)",
                                }}
                              >
                                {pending().code}
                              </code>
                              <button
                                onClick={copyCode}
                                class="p-2 rounded transition-colors"
                                style={{
                                  background: "var(--background-base)",
                                  border: "1px solid var(--border-base)",
                                  color: codeCopied() ? "var(--icon-success-base)" : "var(--icon-base)",
                                }}
                                title="Copy code"
                              >
                                <Show when={codeCopied()} fallback={<Copy class="w-4 h-4" />}>
                                  <Check class="w-4 h-4" />
                                </Show>
                              </button>
                            </div>
                          </div>
                        </Show>

                        {/* Auto method - show waiting spinner */}
                        <Show when={pending().method === "auto"}>
                          <div class="flex items-center gap-2">
                            <Spinner class="w-4 h-4" />
                            <span class="text-sm" style={{ color: "var(--text-weak)" }}>
                              Waiting for authorization...
                            </span>
                          </div>
                        </Show>

                        {/* Code method - show input */}
                        <Show when={pending().method === "code"}>
                          <div class="space-y-2">
                            <input
                              type="text"
                              value={oauthCode()}
                              onInput={(e) => setOauthCode(e.currentTarget.value)}
                              placeholder="Paste authorization code here..."
                              class="w-full px-3 py-2 rounded-md text-sm font-mono"
                              style={{
                                background: "var(--background-base)",
                                border: "1px solid var(--border-base)",
                                color: "var(--text-base)",
                              }}
                            />
                            <button
                              type="button"
                              disabled={connecting() || !oauthCode().trim()}
                              onClick={handleOAuthComplete}
                              class="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                              style={{
                                background: "var(--interactive-base)",
                                color: "white",
                              }}
                            >
                              <Show when={connecting()} fallback="Complete Authentication">
                                <Spinner class="w-4 h-4" />
                                Verifying...
                              </Show>
                            </button>
                          </div>
                        </Show>
                      </div>
                    )}
                  </Show>

                  <form onSubmit={handleConnect} class="space-y-4">
                    {/* Search and Provider Selection */}
                    <Show when={!oauthPending()}>
                      <div>
                        {/* Search input */}
                        <div class="relative mb-3">
                          <Search
                            class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                            style={{ color: "var(--text-weak)" }}
                          />
                          <input
                            type="text"
                            value={providerSearch()}
                            onInput={(e) => setProviderSearch(e.currentTarget.value)}
                            placeholder="Search providers..."
                            class="w-full pl-9 pr-8 py-2 rounded-md text-sm"
                            style={{
                              background: "var(--background-base)",
                              border: "1px solid var(--border-base)",
                              color: "var(--text-base)",
                            }}
                          />
                          <Show when={providerSearch()}>
                            <button
                              type="button"
                              onClick={() => setProviderSearch("")}
                              class="absolute right-2 top-1/2 -translate-y-1/2 p-1"
                              style={{ color: "var(--text-weak)" }}
                            >
                              <X class="w-4 h-4" />
                            </button>
                          </Show>
                        </div>

                        {/* Provider grid - max height with scroll */}
                        <div class="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                          <For each={filteredProviders()}>
                            {(provider) => (
                              <button
                                type="button"
                                onClick={() => setSelectedProvider(provider.id)}
                                class="p-3 rounded-md text-left transition-colors"
                                style={{
                                  border:
                                    selectedProvider() === provider.id
                                      ? "1px solid var(--interactive-base)"
                                      : "1px solid var(--border-base)",
                                  background:
                                    selectedProvider() === provider.id ? "var(--surface-inset)" : "transparent",
                                }}
                              >
                                <div class="flex items-center gap-2">
                                  <span class="text-sm font-medium" style={{ color: "var(--text-strong)" }}>
                                    {provider.name}
                                  </span>
                                  <Show when={provider.id === "opencode"}>
                                    <span
                                      class="text-xs px-1.5 py-0.5 rounded"
                                      style={{
                                        background: "var(--interactive-base)",
                                        color: "white",
                                      }}
                                    >
                                      Recommended
                                    </span>
                                  </Show>
                                </div>
                                <div class="text-xs" style={{ color: "var(--text-weak)" }}>
                                  {Object.keys(provider.models).length} models
                                </div>
                              </button>
                            )}
                          </For>
                        </div>

                        <Show when={filteredProviders().length === 0 && providerSearch()}>
                          <p class="text-sm text-center py-4" style={{ color: "var(--text-weak)" }}>
                            No providers found matching "{providerSearch()}"
                          </p>
                        </Show>

                        <Show
                          when={
                            providers.providers.filter((p) => !providers.connected.includes(p.id)).length === 0 &&
                            !providerSearch()
                          }
                        >
                          <p class="text-sm" style={{ color: "var(--text-weak)" }}>
                            All available providers are connected!
                          </p>
                        </Show>
                      </div>
                    </Show>

                    {/* Auth Methods for Selected Provider */}
                    <Show when={selectedProvider() && !oauthPending()}>
                      <div class="space-y-3">
                        <label class="block text-sm font-medium" style={{ color: "var(--text-base)" }}>
                          Connect {getProviderDisplayName(selectedProvider()!)}
                        </label>

                        {/* Show auth method buttons */}
                        <Show
                          when={selectedProviderAuthMethods().length > 0}
                          fallback={
                            /* Fallback to API key input if no auth methods defined */
                            <div class="space-y-3">
                              <input
                                type="password"
                                value={apiKey()}
                                onInput={(e) => setApiKey(e.currentTarget.value)}
                                placeholder="Enter your API key..."
                                class="w-full px-3 py-2 rounded-md text-sm"
                                style={{
                                  background: "var(--background-base)",
                                  border: "1px solid var(--border-base)",
                                  color: "var(--text-base)",
                                }}
                              />
                              <button
                                type="submit"
                                disabled={connecting() || !apiKey().trim()}
                                class="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                                style={{
                                  background: "var(--interactive-base)",
                                  color: "white",
                                }}
                              >
                                <Show when={connecting()} fallback="Connect with API Key">
                                  <Spinner class="w-4 h-4" />
                                  Connecting...
                                </Show>
                              </button>
                            </div>
                          }
                        >
                          <div class="space-y-2">
                            <For each={selectedProviderAuthMethods()}>
                              {(method, index) => (
                                <Show
                                  when={method.type === "oauth"}
                                  fallback={
                                    /* API key method */
                                    <div class="space-y-2">
                                      <div
                                        class="flex items-center gap-2 text-xs"
                                        style={{ color: "var(--text-weak)" }}
                                      >
                                        <Key class="w-3 h-3" />
                                        <span>{method.label}</span>
                                      </div>
                                      <input
                                        type="password"
                                        value={apiKey()}
                                        onInput={(e) => setApiKey(e.currentTarget.value)}
                                        placeholder="Enter your API key..."
                                        class="w-full px-3 py-2 rounded-md text-sm"
                                        style={{
                                          background: "var(--background-base)",
                                          border: "1px solid var(--border-base)",
                                          color: "var(--text-base)",
                                        }}
                                      />
                                      <button
                                        type="submit"
                                        disabled={connecting() || !apiKey().trim()}
                                        class="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                                        style={{
                                          background: "var(--interactive-base)",
                                          color: "white",
                                        }}
                                      >
                                        <Show when={connecting()} fallback="Connect">
                                          <Spinner class="w-4 h-4" />
                                          Connecting...
                                        </Show>
                                      </button>
                                    </div>
                                  }
                                >
                                  {/* OAuth method */}
                                  <button
                                    type="button"
                                    disabled={connecting()}
                                    onClick={() => handleOAuthStart(selectedProvider()!, index())}
                                    class="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                                    style={{
                                      background: "var(--interactive-base)",
                                      color: "white",
                                    }}
                                  >
                                    <Show when={connecting()} fallback={<ExternalLink class="w-4 h-4" />}>
                                      <Spinner class="w-4 h-4" />
                                    </Show>
                                    {method.label}
                                  </button>
                                </Show>
                              )}
                            </For>
                          </div>
                        </Show>

                        <p class="text-xs" style={{ color: "var(--text-weak)" }}>
                          Your credentials are stored securely and never shared.
                        </p>
                      </div>
                    </Show>
                  </form>
                </div>
              </section>
            </div>
          </Show>

          {/* Git Tab */}
          <Show when={activeTab() === "git"}>
            <div class="space-y-6">
              <header>
                <h1 class="text-lg font-medium" style={{ color: "var(--text-strong)" }}>
                  Git Authentication
                </h1>
                <p class="text-sm mt-1" style={{ color: "var(--text-weak)" }}>
                  Configure SSH keys to push and pull from remote repositories
                </p>
              </header>

              {/* SSH Key Section */}
              <section
                class="rounded-lg overflow-hidden"
                style={{
                  background: "var(--background-base)",
                  border: "1px solid var(--border-base)",
                }}
              >
                <div class="px-4 py-3" style={{ "border-bottom": "1px solid var(--border-base)" }}>
                  <h2 class="text-sm font-medium" style={{ color: "var(--text-strong)" }}>
                    SSH Key
                  </h2>
                </div>
                <div class="p-4">
                  <Show when={sshKeyLoading()}>
                    <div class="flex items-center gap-2" style={{ color: "var(--text-weak)" }}>
                      <Spinner class="w-4 h-4" />
                      <span class="text-sm">Checking for SSH keys...</span>
                    </div>
                  </Show>

                  <Show when={sshKeyError()}>
                    <div class="p-3 bg-red-50 border border-red-200 text-red-800 rounded-md text-sm mb-4">
                      {sshKeyError()}
                    </div>
                  </Show>

                  <Show when={!sshKeyLoading() && sshKeys().length === 0}>
                    <div class="text-center py-4">
                      <p class="text-sm mb-4" style={{ color: "var(--text-weak)" }}>
                        No SSH keys found. Generate one to authenticate with Git providers.
                      </p>
                      <button
                        onClick={generateSshKey}
                        disabled={sshKeyGenerating()}
                        class="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                        style={{
                          background: "var(--interactive-base)",
                          color: "white",
                        }}
                      >
                        <Show when={sshKeyGenerating()} fallback="Generate SSH Key">
                          <Spinner class="w-4 h-4" />
                          Generating...
                        </Show>
                      </button>
                    </div>
                  </Show>

                  <Show when={!sshKeyLoading() && sshKeys().length > 0}>
                    <div class="space-y-4">
                      {/* Key Selection Dropdown */}
                      <div>
                        <label class="block text-sm font-medium mb-2" style={{ color: "var(--text-base)" }}>
                          Select Key
                        </label>
                        <select
                          value={selectedKeyName() || ""}
                          onChange={(e) => setSelectedKeyName(e.currentTarget.value)}
                          class="w-full px-3 py-2 rounded-md text-sm"
                          style={{
                            background: "var(--background-base)",
                            border: "1px solid var(--border-base)",
                            color: "var(--text-base)",
                          }}
                        >
                          <For each={sshKeys()}>{(key) => <option value={key.name}>{key.name}</option>}</For>
                        </select>
                      </div>

                      {/* Selected Key Display */}
                      <Show when={selectedKey()}>
                        <div>
                          <label class="block text-sm font-medium mb-2" style={{ color: "var(--text-base)" }}>
                            Public Key
                          </label>
                          <div class="relative">
                            <pre
                              class="p-3 rounded-md text-xs overflow-x-auto"
                              style={{
                                background: "var(--surface-inset)",
                                color: "var(--text-base)",
                                "word-break": "break-all",
                                "white-space": "pre-wrap",
                              }}
                            >
                              {selectedKey()}
                            </pre>
                            <button
                              onClick={copySshKey}
                              class="absolute top-2 right-2 p-1.5 rounded transition-colors"
                              style={{
                                background: "var(--background-base)",
                                border: "1px solid var(--border-base)",
                                color: sshKeyCopied() ? "var(--icon-success-base)" : "var(--icon-base)",
                              }}
                              title="Copy to clipboard"
                            >
                              <Show when={sshKeyCopied()} fallback={<Copy class="w-4 h-4" />}>
                                <Check class="w-4 h-4" />
                              </Show>
                            </button>
                          </div>
                        </div>
                      </Show>

                      <div class="flex gap-2 flex-wrap">
                        <Button onClick={loadSshKeys} variant="secondary" size="sm">
                          Refresh
                        </Button>
                        <Button onClick={openAddKeyDialog} variant="secondary" size="sm">
                          <Plus class="w-3.5 h-3.5" />
                          Add Existing Key
                        </Button>
                        <Button onClick={generateSshKey} disabled={sshKeyGenerating()} variant="secondary" size="sm">
                          <Show when={sshKeyGenerating()} fallback="Generate New Key">
                            <Spinner class="w-3 h-3" />
                          </Show>
                        </Button>
                        <Show when={selectedKeyName()}>
                          <Button onClick={() => setKeyToRemove(selectedKeyName())} variant="danger" size="sm" class="ml-auto">
                            <Trash2 class="w-3.5 h-3.5" />
                            Remove
                          </Button>
                        </Show>
                      </div>
                    </div>
                  </Show>
                </div>
              </section>

              {/* Add Existing Key Dialog */}
              <Show when={showAddKeyDialog()}>
                <div
                  class="fixed inset-0 z-50 flex items-center justify-center p-4"
                  style={{ background: "rgba(0, 0, 0, 0.5)" }}
                  onClick={closeAddKeyDialog}
                >
                  <div
                    class="rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                    style={{
                      background: "var(--background-base)",
                      border: "1px solid var(--border-base)",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div class="flex items-center justify-between mb-4">
                      <h3 class="text-lg font-semibold" style={{ color: "var(--text-strong)" }}>
                        Add Existing SSH Key
                      </h3>
                      <button
                        onClick={closeAddKeyDialog}
                        class="p-1 rounded transition-colors"
                        style={{ color: "var(--text-weak)" }}
                      >
                        <X class="w-5 h-5" />
                      </button>
                    </div>

                    <div class="space-y-4">
                      {/* Key Content Textarea */}
                      <div>
                        <label class="block text-sm font-medium mb-2" style={{ color: "var(--text-base)" }}>
                          Public Key Content
                        </label>
                        <textarea
                          value={addKeyContent()}
                          onInput={(e) => handleAddKeyContentChange(e.currentTarget.value)}
                          placeholder="Paste your SSH public key here (e.g., ssh-ed25519 AAAA... user@host)"
                          rows={5}
                          class="w-full px-3 py-2 rounded-md text-sm font-mono"
                          style={{
                            background: "var(--surface-inset)",
                            border: "1px solid var(--border-base)",
                            color: "var(--text-base)",
                            resize: "vertical",
                          }}
                        />
                      </div>

                      {/* Private Key Content Textarea */}
                      <div>
                        <label class="block text-sm font-medium mb-2" style={{ color: "var(--text-base)" }}>
                          Private Key Content
                        </label>
                        <textarea
                          value={addKeyPrivateContent()}
                          onInput={(e) => setAddKeyPrivateContent(e.currentTarget.value)}
                          placeholder="Paste your SSH private key here (e.g., -----BEGIN OPENSSH PRIVATE KEY-----)"
                          rows={8}
                          class="w-full px-3 py-2 rounded-md text-xs font-mono"
                          style={{
                            background: "var(--surface-inset)",
                            border: "1px solid var(--border-base)",
                            color: "var(--text-base)",
                            resize: "vertical",
                          }}
                        />
                        <p class="text-xs mt-1 text-orange-600">
                          ⚠️ Warning: Anyone with access to this notebook environment can read this private key. Only
                          use keys specifically created for this notebook.
                        </p>
                      </div>

                      {/* Auto-detected Key Name */}
                      <div>
                        <label class="block text-sm font-medium mb-2" style={{ color: "var(--text-base)" }}>
                          Key Name
                        </label>
                        <input
                          type="text"
                          value={addKeyName()}
                          onInput={(e) => setAddKeyName(e.currentTarget.value)}
                          placeholder="my_key"
                          class="w-full px-3 py-2 rounded-md text-sm"
                          style={{
                            background: "var(--surface-inset)",
                            border: "1px solid var(--border-base)",
                            color: "var(--text-base)",
                          }}
                        />
                        <p class="text-xs mt-1" style={{ color: "var(--text-weak)" }}>
                          Files will be saved as ~/.ssh/{addKeyName() || "key_name"} (private) and ~/.ssh/
                          {addKeyName() || "key_name"}.pub (public)
                        </p>
                      </div>

                      {/* Error Message */}
                      <Show when={addKeyError()}>
                        <div class="p-3 bg-red-50 border border-red-200 text-red-800 rounded-md text-sm">
                          {addKeyError()}
                        </div>
                      </Show>

                      {/* Action Buttons */}
                      <div class="flex gap-2 justify-end pt-2">
                        <Button onClick={closeAddKeyDialog} disabled={addKeyAdding()} variant="secondary" size="md">
                          Cancel
                        </Button>
                        <Button
                          onClick={addExistingSshKey}
                          disabled={
                            addKeyAdding() ||
                            !addKeyContent().trim() ||
                            !addKeyPrivateContent().trim() ||
                            !addKeyName().trim()
                          }
                          variant="primary"
                          size="md"
                          title={
                            !addKeyPrivateContent().trim() ? "Private key is required for Git operations" : undefined
                          }
                        >
                          <Show when={addKeyAdding()} fallback="Add Key Pair">
                            <Spinner class="w-4 h-4" />
                            Adding...
                          </Show>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Show>

              {/* Remove Key Confirmation Dialog */}
              <Show when={keyToRemove()}>
                <div
                  class="fixed inset-0 z-50 flex items-center justify-center p-4"
                  style={{ background: "rgba(0, 0, 0, 0.5)" }}
                  onClick={() => setKeyToRemove(null)}
                >
                  <div
                    class="rounded-lg p-6 max-w-md w-full"
                    style={{
                      background: "var(--background-base)",
                      border: "1px solid var(--border-base)",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div class="flex items-center justify-between mb-4">
                      <h3 class="text-lg font-semibold" style={{ color: "var(--text-strong)" }}>
                        Remove SSH Key
                      </h3>
                      <button
                        onClick={() => setKeyToRemove(null)}
                        class="p-1 rounded transition-colors"
                        style={{ color: "var(--text-weak)" }}
                      >
                        <X class="w-5 h-5" />
                      </button>
                    </div>

                    <p class="text-sm mb-6" style={{ color: "var(--text-base)" }}>
                      Are you sure you want to remove the key <strong>{keyToRemove()}</strong>?
                      <br />
                      <br />
                      This will delete both the public key ({keyToRemove()}.pub) and the private key ({keyToRemove()}).
                      This action cannot be undone.
                    </p>

                    <div class="flex gap-2 justify-end">
                      <Button onClick={() => setKeyToRemove(null)} disabled={removeKeyLoading()} variant="secondary" size="md">
                        Cancel
                      </Button>
                      <Button
                        onClick={() => {
                          const name = keyToRemove()
                          if (name) removeSshKey(name)
                        }}
                        disabled={removeKeyLoading()}
                        variant="danger"
                        size="md"
                      >
                        <Show when={removeKeyLoading()} fallback="Remove">
                          <Spinner class="w-4 h-4" />
                          Removing...
                        </Show>
                      </Button>
                    </div>
                  </div>
                </div>
              </Show>

              {/* Instructions Section */}
              <section
                class="rounded-lg p-4"
                style={{
                  background: "var(--surface-inset)",
                  border: "1px solid var(--border-base)",
                }}
              >
                <h3 class="text-sm font-medium mb-3" style={{ color: "var(--text-strong)" }}>
                  Add your key to a Git provider
                </h3>
                <div class="space-y-2 text-sm" style={{ color: "var(--text-weak)" }}>
                  <p>Copy your public key above and add it to your Git provider:</p>
                  <ul class="list-disc list-inside space-y-1 ml-2">
                    <li>
                      <a
                        href="https://github.com/settings/ssh/new"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="hover:underline"
                        style={{ color: "var(--text-interactive-base)" }}
                      >
                        GitHub
                      </a>
                      {" → Settings → SSH and GPG keys → New SSH key"}
                    </li>
                    <li>
                      <a
                        href="https://gitlab.com/-/user_settings/ssh_keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="hover:underline"
                        style={{ color: "var(--text-interactive-base)" }}
                      >
                        GitLab
                      </a>
                      {" → Preferences → SSH Keys"}
                    </li>
                    <li>
                      <a
                        href="https://bitbucket.org/account/settings/ssh-keys/"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="hover:underline"
                        style={{ color: "var(--text-interactive-base)" }}
                      >
                        Bitbucket
                      </a>
                      {" → Personal settings → SSH keys"}
                    </li>
                  </ul>
                </div>
              </section>
            </div>
          </Show>

          {/* MCP Servers Tab */}
          <Show when={activeTab() === "mcp"}>
            <div class="space-y-6">
              <header>
                <h1 class="text-lg font-medium" style={{ color: "var(--text-strong)" }}>
                  MCP Servers
                </h1>
                <p class="text-sm mt-1" style={{ color: "var(--text-weak)" }}>
                  Model Context Protocol servers extend AI capabilities with tools and resources
                </p>
              </header>

              {/* Server List */}
              <section
                class="rounded-lg overflow-hidden"
                style={{
                  background: "var(--background-base)",
                  border: "1px solid var(--border-base)",
                }}
              >
                <div
                  class="px-4 py-3 flex items-center justify-between"
                  style={{ "border-bottom": "1px solid var(--border-base)" }}
                >
                  <h2 class="text-sm font-medium" style={{ color: "var(--text-strong)" }}>
                    Configured Servers ({mcp.stats().enabled}/{mcp.stats().total} connected)
                  </h2>
                  <Button onClick={() => setShowMCPAddDialog(true)} variant="primary" size="sm">
                    + Add Server
                  </Button>
                </div>

                <Show when={mcp.loading()}>
                  <div class="p-6 flex items-center justify-center gap-2" style={{ color: "var(--text-weak)" }}>
                    <Spinner class="w-4 h-4" />
                    <span class="text-sm">Loading MCP servers...</span>
                  </div>
                </Show>

                <Show when={!mcp.loading() && Object.keys(mcp.servers).length === 0}>
                  <div class="p-6 text-center">
                    <p class="text-sm" style={{ color: "var(--text-weak)" }}>
                      No MCP servers configured yet.
                    </p>
                    <button
                      onClick={() => setShowMCPAddDialog(true)}
                      class="mt-2 text-sm hover:underline"
                      style={{ color: "var(--text-interactive-base)" }}
                    >
                      Add your first server
                    </button>
                  </div>
                </Show>

                <Show when={!mcp.loading() && Object.keys(mcp.servers).length > 0}>
                  <div class="divide-y" style={{ "border-color": "var(--border-base)" }}>
                    <For each={Object.entries(mcp.servers).sort((a, b) => a[0].localeCompare(b[0]))}>
                      {([name, status]) => {
                        const isConnected = () => status.status === "connected"
                        const isFailed = () => status.status === "failed"
                        const needsAuth = () => status.status === "needs_auth"
                        const errorMsg = () => (status.status === "failed" ? (status as any).error : undefined)

                        return (
                          <div class="px-4 py-3 flex items-center justify-between gap-4">
                            <div class="flex-1 min-w-0">
                              <div class="flex items-center gap-2">
                                <span class="font-medium text-sm" style={{ color: "var(--text-strong)" }}>
                                  {name}
                                </span>
                                <span
                                  class="text-xs px-1.5 py-0.5 rounded"
                                  style={{
                                    background: "var(--surface-inset)",
                                    color: isConnected()
                                      ? "var(--icon-success-base)"
                                      : isFailed()
                                        ? "var(--icon-critical-base)"
                                        : needsAuth()
                                          ? "var(--icon-warning-base)"
                                          : "var(--text-weak)",
                                  }}
                                >
                                  {status.status === "connected"
                                    ? "Connected"
                                    : status.status === "disabled"
                                      ? "Disabled"
                                      : status.status === "failed"
                                        ? "Failed"
                                        : status.status === "needs_auth"
                                          ? "Needs Auth"
                                          : status.status}
                                </span>
                                <Show when={mcpLoading() === name}>
                                  <Spinner class="w-3 h-3" />
                                </Show>
                              </div>
                              <Show when={errorMsg()}>
                                <p class="text-xs mt-0.5 truncate" style={{ color: "var(--text-weak)" }}>
                                  {errorMsg()}
                                </p>
                              </Show>
                            </div>

                            <div class="flex items-center gap-2">
                              <Show when={needsAuth()}>
                                <button
                                  onClick={async () => {
                                    setMcpLoading(name)
                                    const result = await mcp.startAuth(name)
                                    if (result?.authorizationUrl) {
                                      window.open(result.authorizationUrl, "_blank")
                                    }
                                    setMcpLoading(null)
                                  }}
                                  class="text-xs px-2 py-1 rounded"
                                  style={{
                                    background: "var(--surface-inset)",
                                    color: "var(--text-interactive-base)",
                                  }}
                                >
                                  Authenticate
                                </button>
                              </Show>

                              {/* Toggle Switch */}
                              <button
                                onClick={async () => {
                                  setMcpLoading(name)
                                  if (isConnected()) {
                                    await mcp.disconnect(name)
                                  } else {
                                    await mcp.connect(name)
                                  }
                                  setMcpLoading(null)
                                }}
                                disabled={mcpLoading() === name || mcpDeleting() === name}
                                class="relative w-10 h-5 rounded-full transition-colors disabled:opacity-50"
                                style={{
                                  background: isConnected() ? "var(--interactive-base)" : "var(--surface-inset)",
                                }}
                              >
                                <div
                                  class="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                                  style={{
                                    background: "white",
                                    left: isConnected() ? "calc(100% - 18px)" : "2px",
                                  }}
                                />
                              </button>

                              {/* Delete Button */}
                              <button
                                onClick={async () => {
                                  if (mcpLoading() || mcpDeleting()) return
                                  if (!confirm(`Remove MCP server "${name}"?`)) return
                                  setMcpDeleting(name)
                                  try {
                                    await mcp.remove(name)
                                  } catch (e) {
                                    console.error("[Settings] Failed to remove MCP server:", e)
                                  } finally {
                                    setMcpDeleting(null)
                                  }
                                }}
                                disabled={mcpLoading() === name || mcpDeleting() === name}
                                class="p-1 rounded transition-colors opacity-50 hover:opacity-100 disabled:opacity-30"
                                style={{ color: "var(--icon-critical-base)" }}
                                title="Remove server"
                              >
                                <Trash2 class="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )
                      }}
                    </For>
                  </div>
                </Show>
              </section>

              {/* Info Section */}
              <section
                class="rounded-lg p-4"
                style={{
                  background: "var(--surface-inset)",
                  border: "1px solid var(--border-base)",
                }}
              >
                <h3 class="text-sm font-medium mb-2" style={{ color: "var(--text-strong)" }}>
                  About MCP
                </h3>
                <p class="text-xs" style={{ color: "var(--text-weak)" }}>
                  The Model Context Protocol (MCP) allows AI assistants to access external tools, APIs, and data
                  sources. Servers can be local (running commands on your machine) or remote (connecting to hosted
                  services).
                </p>
                <a
                  href="https://modelcontextprotocol.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-xs mt-2 inline-block hover:underline"
                  style={{ color: "var(--text-interactive-base)" }}
                >
                  Learn more about MCP →
                </a>
              </section>
            </div>
          </Show>

        </div>
      </div>

      {/* MCP Add Dialog */}
      <Show when={showMCPAddDialog()}>
        <MCPAddDialog onClose={() => setShowMCPAddDialog(false)} onBack={() => setShowMCPAddDialog(false)} />
      </Show>
    </div>
  )
}
