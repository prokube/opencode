/**
 * Production UI Server for OpenCode Prefixable
 *
 * This server:
 * 1. Serves static files from /opt/opencode-ui/dist
 * 2. Proxies API requests to the OpenCode API server (localhost:4096)
 * 3. Injects NB_PREFIX into index.html at runtime
 */

const BASE_PATH = process.env.NB_PREFIX || process.env.BASE_PATH || "/"
const PORT = parseInt(process.env.PORT || "8888", 10)
const API_URL = process.env.API_URL || "http://127.0.0.1:4096"
const DIST_DIR = process.env.DIST_DIR || "/opt/opencode-ui/dist"

console.log(`OpenCode UI Server starting...`)
console.log(`  BASE_PATH: ${BASE_PATH}`)
console.log(`  API_URL: ${API_URL}`)
console.log(`  PORT: ${PORT}`)
console.log(`  DIST_DIR: ${DIST_DIR}`)

// Normalize base path
const basePathWithoutTrailing = BASE_PATH.endsWith("/") ? BASE_PATH.slice(0, -1) : BASE_PATH
const basePathWithTrailing = BASE_PATH.endsWith("/") ? BASE_PATH : BASE_PATH + "/"

// MIME types for static files
const mimeTypes: Record<string, string> = {
  js: "application/javascript",
  mjs: "application/javascript",
  css: "text/css",
  html: "text/html",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  eot: "application/vnd.ms-fontobject",
  map: "application/json",
}

// API paths that should be proxied to the OpenCode API server
const apiPaths = [
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
]

function isApiPath(path: string): boolean {
  return apiPaths.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p + "?"))
}

const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  idleTimeout: 0, // Disable timeout for SSE connections

  async fetch(req) {
    const url = new URL(req.url)
    let path = url.pathname

    // Strip base path prefix if present
    if (basePathWithoutTrailing && path.startsWith(basePathWithoutTrailing)) {
      path = path.slice(basePathWithoutTrailing.length) || "/"
    }
    if (!path.startsWith("/")) {
      path = "/" + path
    }

    // Check if this is an API request (after stripping prefix)
    if (isApiPath(path)) {
      const target = new URL(path + url.search, API_URL)
      const headers = new Headers(req.headers)

      // SSE requests need special handling
      if (path.startsWith("/event")) {
        console.log("[Proxy] SSE request to:", target.toString())
        try {
          const response = await fetch(target.toString(), {
            method: req.method,
            headers,
          })

          if (!response.ok) {
            console.error("[Proxy] SSE error:", response.status, response.statusText)
            return new Response(response.body, { status: response.status })
          }

          return new Response(response.body, {
            status: response.status,
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
              "X-Accel-Buffering": "no",
            },
          })
        } catch (e) {
          console.error("[Proxy] SSE connection error:", e)
          return new Response("SSE proxy error", { status: 502 })
        }
      }

      // Regular API requests
      console.log("[Proxy] API:", req.method, path)
      try {
        return await fetch(target.toString(), {
          method: req.method,
          headers,
          body: req.body,
        })
      } catch (e) {
        console.error("[Proxy] API error:", e)
        return new Response("API proxy error", { status: 502 })
      }
    }

    // Frontend routes - path is already stripped above
    // Try to serve static file
    const filePath = `${DIST_DIR}${path}`
    const file = Bun.file(filePath)

    if (await file.exists()) {
      const ext = path.split(".").pop()?.toLowerCase() || ""
      const contentType = mimeTypes[ext] || "application/octet-stream"

      return new Response(file, {
        headers: {
          "Content-Type": contentType,
          // Cache static assets
          ...(ext !== "html" && {
            "Cache-Control": "public, max-age=31536000, immutable",
          }),
        },
      })
    }

    // SPA fallback - serve index.html with injected base path
    const indexPath = `${DIST_DIR}/index.html`
    const indexFile = Bun.file(indexPath)

    if (!(await indexFile.exists())) {
      console.error("index.html not found at:", indexPath)
      return new Response("Not Found", { status: 404 })
    }

    const indexHtml = await indexFile.text()
    const injected = indexHtml.replace('<base href="/" />', `<base href="${basePathWithTrailing}" />`).replace(
      "window.__OPENCODE__ = window.__OPENCODE__ || {}",
      // Don't set serverUrl - let the browser use window.location.origin
      // API requests will be proxied through this server
      `window.__OPENCODE__ = { basePath: "${basePathWithTrailing}" }`,
    )

    return new Response(injected, {
      headers: {
        "Content-Type": "text/html",
        "Cache-Control": "no-cache",
      },
    })
  },
})

console.log(`\nOpenCode UI Server running at http://0.0.0.0:${PORT}${basePathWithTrailing}`)
console.log(`Proxying API requests to ${API_URL}`)
