/**
 * Prokube-specific API endpoints
 *
 * These endpoints are handled directly by the UI server (dev.ts / serve-ui.ts),
 * NOT proxied to the OpenCode backend. This allows us to add features without
 * modifying upstream code.
 */

import * as fs from "node:fs"
import * as nodePath from "node:path"

/**
 * API paths that should be proxied to the OpenCode API server.
 * Prokube endpoints (/api/prokube/*) are NOT in this list - they're handled separately.
 */
export const API_PATHS = [
  "/api",
  "/event",
  "/config",
  "/provider",
  "/project",
  "/permission",
  "/pty",
  "/mcp",
  "/file",
  "/health",
  "/path",
  "/command",
  "/auth",
  "/app",
  "/agent",
  "/session",
  "/global",
  "/skill",
  "/lsp",
  "/formatter",
  "/doc",
  "/log",
  "/instance",
  "/question",
  "/find",
  "/vcs",
]

/**
 * Check if a path should be proxied to the OpenCode API server.
 */
export function isApiPath(path: string): boolean {
  return API_PATHS.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p + "?"))
}

/**
 * Handle prokube-specific endpoints.
 * Returns a Response if the path matches a prokube endpoint, otherwise undefined.
 */
export async function handleProkubeEndpoint(
  path: string,
  method: string,
  url: URL,
  req: Request,
): Promise<Response | undefined> {
  // POST /api/prokube/mkdir - Create directory recursively
  if (path === "/api/prokube/mkdir" && method === "POST") {
    try {
      const body = await req.json()
      const dirPath = body.path
      if (!dirPath || typeof dirPath !== "string") {
        return Response.json({ error: "path is required" }, { status: 400 })
      }
      console.log("[Prokube] mkdir:", dirPath)
      await fs.promises.mkdir(dirPath, { recursive: true })
      return Response.json(true)
    } catch (e) {
      console.error("[Prokube] mkdir error:", e)
      return Response.json(false)
    }
  }

  // GET /api/prokube/list-dirs - List directories in a given path (2 levels deep)
  if (path === "/api/prokube/list-dirs" && method === "GET") {
    const directory = url.searchParams.get("directory")
    const query = url.searchParams.get("query") || ""
    const limit = parseInt(url.searchParams.get("limit") || "50", 10)

    if (!directory) {
      return Response.json({ error: "directory parameter is required" }, { status: 400 })
    }

    console.log("[Prokube] list-dirs:", directory, "query:", query)

    try {
      const dirs: string[] = []
      const ignoreNested = new Set(["node_modules", "dist", "build", "target", "vendor", ".git"])
      const shouldIgnore = (name: string) => name.startsWith(".") || ignoreNested.has(name)

      // Read top-level directories
      const topEntries = await fs.promises.readdir(directory, { withFileTypes: true }).catch(() => [])

      for (const entry of topEntries) {
        if (!entry.isDirectory()) continue
        if (shouldIgnore(entry.name)) continue
        dirs.push(entry.name + "/")

        // Read second-level directories
        const subDir = nodePath.join(directory, entry.name)
        const subEntries = await fs.promises.readdir(subDir, { withFileTypes: true }).catch(() => [])
        for (const subEntry of subEntries) {
          if (!subEntry.isDirectory()) continue
          if (shouldIgnore(subEntry.name)) continue
          dirs.push(entry.name + "/" + subEntry.name + "/")
        }
      }

      // Sort and filter by query
      dirs.sort()
      const queryLower = query.trim().toLowerCase()
      const filtered = queryLower ? dirs.filter((d) => d.toLowerCase().includes(queryLower)) : dirs

      return Response.json(filtered.slice(0, limit))
    } catch (e) {
      console.error("[Prokube] list-dirs error:", e)
      return Response.json([])
    }
  }

  // DELETE /api/prokube/mcp/:name - Remove an MCP server from global config
  if (path.startsWith("/api/prokube/mcp/") && method === "DELETE") {
    const serverName = path.replace("/api/prokube/mcp/", "")
    if (!serverName) {
      return Response.json({ error: "server name is required" }, { status: 400 })
    }

    console.log("[Prokube] Deleting MCP server:", serverName)

    try {
      // Find the global config file
      const homeDir = process.env.HOME || "/home/jovyan"
      const configDir = process.env.OPENCODE_CONFIG_DIR || nodePath.join(homeDir, ".config", "opencode")

      // Try both .jsonc and .json
      let configPath = nodePath.join(configDir, "opencode.jsonc")
      if (!fs.existsSync(configPath)) {
        configPath = nodePath.join(configDir, "opencode.json")
      }

      if (!fs.existsSync(configPath)) {
        return Response.json({ error: "Config file not found" }, { status: 404 })
      }

      // Read and parse config
      const content = await fs.promises.readFile(configPath, "utf-8")

      // Try parsing as JSON first, then strip comments if it fails
      let config: Record<string, unknown>
      try {
        config = JSON.parse(content)
      } catch {
        // Strip comments more carefully - only match // at start of line or after whitespace
        // (not inside strings like URLs)
        const jsonContent = content
          .split("\n")
          .map((line) => {
            // Remove trailing comments (// at end of line, but not in strings)
            // Simple heuristic: if line has even number of quotes before //, it's a comment
            const commentMatch = line.match(/^([^"]*(?:"[^"]*"[^"]*)*)\s*\/\//)
            if (commentMatch) {
              return commentMatch[1]
            }
            return line
          })
          .join("\n")
          .replace(/\/\*[\s\S]*?\*\//g, "") // Remove multi-line comments

        config = JSON.parse(jsonContent)
      }

      // Remove the MCP server
      if (config.mcp && config.mcp[serverName]) {
        delete config.mcp[serverName]
        console.log("[Prokube] Removed MCP server from config:", serverName)
      } else {
        console.log("[Prokube] MCP server not found in config:", serverName)
        return Response.json({ error: "Server not found in config" }, { status: 404 })
      }

      // Write back (as plain JSON since we stripped comments)
      await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2))
      console.log("[Prokube] Config saved")

      return Response.json({ success: true })
    } catch (e) {
      console.error("[Prokube] mcp delete error:", e)
      return Response.json({ error: String(e) }, { status: 500 })
    }
  }

  // Not a prokube endpoint
  return undefined
}
