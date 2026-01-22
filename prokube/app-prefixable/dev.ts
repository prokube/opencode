import { watch } from "fs"

const BASE_PATH = process.env.BASE_PATH || "/"
const PORT = parseInt(process.env.PORT || "3000", 10)
const API_URL = process.env.API_URL || "http://127.0.0.1:4096"

console.log(`Starting dev server...`)
console.log(`  BASE_PATH: ${BASE_PATH}`)
console.log(`  API_URL: ${API_URL}`)
console.log(`  PORT: ${PORT}`)

// Initial build
await import("./build")

// Normalize base path for matching
const basePathWithoutTrailing = BASE_PATH.endsWith("/") ? BASE_PATH.slice(0, -1) : BASE_PATH
const basePathWithTrailing = BASE_PATH.endsWith("/") ? BASE_PATH : BASE_PATH + "/"

const server = Bun.serve({
  port: PORT,
  idleTimeout: 0, // Disable timeout for SSE connections
  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname

    // API requests go directly to the API without base path
    // The SDK calls these paths directly on the origin
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
    ]

    // Check if this is an API request (not a frontend route)
    // API paths don't have the base path prefix
    const isApiPath = apiPaths.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p + "?"))

    // Special handling for /session - only API if it doesn't have base path prefix
    // Frontend routes: /opencode/session, /opencode/session/, /opencode/session/abc123
    // API routes: /session (POST), /session/list, /session/create, etc.
    const isSessionApi =
      (path === "/session" || path.startsWith("/session/") || path.startsWith("/session?")) &&
      !path.startsWith(basePathWithoutTrailing) // Not prefixed with base path = API call

    const isApiRequest = isApiPath || isSessionApi

    if (isApiRequest) {
      const target = new URL(path + url.search, API_URL)
      const headers = new Headers(req.headers)

      // SSE requests - just pass through the response body directly
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

          // Pass through the body directly - Bun handles streaming
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

      console.log("[Proxy] API:", req.method, path)
      return fetch(target.toString(), {
        method: req.method,
        headers,
        body: req.body,
      })
    }

    // Frontend routes - strip base path prefix for file lookup
    let strippedPath = path
    if (basePathWithoutTrailing && path.startsWith(basePathWithoutTrailing)) {
      strippedPath = path.slice(basePathWithoutTrailing.length) || "/"
    }
    if (!strippedPath.startsWith("/")) {
      strippedPath = "/" + strippedPath
    }

    // Try to serve static file
    const filePath = `./dist${strippedPath}`
    const file = Bun.file(filePath)
    if (await file.exists()) {
      const ext = strippedPath.split(".").pop() || ""
      const mimeTypes: Record<string, string> = {
        js: "application/javascript",
        css: "text/css",
        html: "text/html",
        json: "application/json",
        svg: "image/svg+xml",
        png: "image/png",
        jpg: "image/jpeg",
        ico: "image/x-icon",
        woff: "font/woff",
        woff2: "font/woff2",
        ttf: "font/ttf",
      }
      return new Response(file, {
        headers: { "Content-Type": mimeTypes[ext] || "application/octet-stream" },
      })
    }

    // SPA fallback - serve index.html with injected base path
    const indexHtml = await Bun.file("./dist/index.html").text()
    const injected = indexHtml
      .replace('<base href="/" />', `<base href="${basePathWithTrailing}" />`)
      .replace(
        "window.__OPENCODE__ = window.__OPENCODE__ || {}",
        `window.__OPENCODE__ = { basePath: "${basePathWithTrailing}" }`,
      )
    return new Response(injected, {
      headers: { "Content-Type": "text/html" },
    })
  },
})

console.log(`\nDev server running at http://localhost:${PORT}${basePathWithTrailing}`)

// Watch for changes and rebuild
let debounce: Timer | null = null
watch("./src", { recursive: true }, async (event, filename) => {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(async () => {
    console.log(`\nFile changed: ${filename}`)
    console.log("Rebuilding...")
    try {
      // Re-import build to trigger rebuild
      const mod = await import(`./build?t=${Date.now()}`)
    } catch (e) {
      console.error("Build error:", e)
    }
  }, 100)
})
