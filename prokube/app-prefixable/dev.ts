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

// Track WebSocket connections: client ws -> backend ws
const wsConnections = new Map<object, WebSocket>()

const server = Bun.serve<{ target: string }>({
  port: PORT,
  idleTimeout: 0, // Disable timeout for SSE connections
  async fetch(req, server) {
    const url = new URL(req.url)
    let path = url.pathname

    // Strip base path prefix if present (for both API and frontend routes)
    let strippedPath = path
    if (basePathWithoutTrailing && path.startsWith(basePathWithoutTrailing)) {
      strippedPath = path.slice(basePathWithoutTrailing.length) || "/"
    }
    if (!strippedPath.startsWith("/")) {
      strippedPath = "/" + strippedPath
    }

    // WebSocket upgrade for /pty routes - proxy to backend
    if (strippedPath.startsWith("/pty/") && req.headers.get("upgrade") === "websocket") {
      const target = API_URL.replace(/^http/, "ws") + strippedPath + url.search
      console.log("[Proxy] WebSocket upgrade:", target)

      // Upgrade to WebSocket and proxy to backend
      const upgraded = server.upgrade(req, {
        data: { target },
      })
      if (upgraded) return undefined
      return new Response("WebSocket upgrade failed", { status: 500 })
    }

    // API requests go directly to the API
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
      "/find",
      "/question",
      "/global",
      "/skill",
      "/lsp",
      "/formatter",
      "/doc",
      "/log",
      "/instance",
    ]

    // Check if this is an API request using the stripped path
    const isApiRequest = apiPaths.some(
      (p) => strippedPath === p || strippedPath.startsWith(p + "/") || strippedPath.startsWith(p + "?"),
    )

    if (isApiRequest) {
      const target = new URL(strippedPath + url.search, API_URL)
      const headers = new Headers(req.headers)

      // SSE requests - just pass through the response body directly
      if (strippedPath.startsWith("/event")) {
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

      console.log("[Proxy] API:", req.method, strippedPath)
      return fetch(target.toString(), {
        method: req.method,
        headers,
        body: req.body,
      })
    }

    // Frontend routes - try to serve static file
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
  websocket: {
    open(ws) {
      const target = ws.data.target
      console.log("[Proxy] WebSocket client connected, connecting to backend:", target)

      // Connect to backend WebSocket
      const backend = new WebSocket(target)

      backend.addEventListener("open", () => {
        console.log("[Proxy] Backend WebSocket connected")
      })

      backend.addEventListener("message", (event) => {
        // Forward backend messages to client
        if (ws.readyState === 1) {
          ws.send(event.data)
        }
      })

      backend.addEventListener("close", (event) => {
        console.log("[Proxy] Backend WebSocket closed:", event.code)
        wsConnections.delete(ws)
        if (ws.readyState === 1) {
          ws.close(event.code, event.reason)
        }
      })

      backend.addEventListener("error", (e) => {
        console.error("[Proxy] Backend WebSocket error:", e)
      })

      wsConnections.set(ws, backend)
    },
    message(ws, message) {
      // Forward client messages to backend
      const backend = wsConnections.get(ws)
      if (backend?.readyState === WebSocket.OPEN) {
        backend.send(message)
      }
    },
    close(ws, code, reason) {
      console.log("[Proxy] Client WebSocket closed:", code)
      const backend = wsConnections.get(ws)
      if (backend) {
        backend.close(code, reason)
        wsConnections.delete(ws)
      }
    },
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
