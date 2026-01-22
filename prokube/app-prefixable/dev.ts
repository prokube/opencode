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
  async fetch(req) {
    const url = new URL(req.url)
    let path = url.pathname

    // Proxy API requests to the OpenCode server
    // These paths match the OpenCode API endpoints
    const apiPaths = [
      "/api/",
      "/event",
      "/session",
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
    ]
    const isApiRequest = apiPaths.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p + "?"))

    if (isApiRequest) {
      const target = new URL(path + url.search, API_URL)
      const headers = new Headers(req.headers)

      // SSE requests need special handling - stream responses properly
      if (path.startsWith("/event")) {
        console.log("[Proxy] SSE request to:", target.toString())
        const response = await fetch(target.toString(), {
          method: req.method,
          headers,
        })

        if (!response.ok) {
          console.error("[Proxy] SSE error:", response.status, response.statusText)
          return new Response(response.body, { status: response.status })
        }

        // Create a transform stream to pass through SSE data
        const { readable, writable } = new TransformStream()
        const writer = writable.getWriter()
        const reader = response.body?.getReader()

        if (reader) {
          ;(async () => {
            try {
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                await writer.write(value)
              }
            } catch (e) {
              console.error("[Proxy] SSE stream error:", e)
            } finally {
              writer.close()
            }
          })()
        }

        return new Response(readable, {
          status: response.status,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        })
      }

      return fetch(target.toString(), {
        method: req.method,
        headers,
        body: req.body,
      })
    }

    // Strip base path prefix for file lookup
    if (basePathWithoutTrailing && path.startsWith(basePathWithoutTrailing)) {
      path = path.slice(basePathWithoutTrailing.length) || "/"
    }

    // Ensure path starts with /
    if (!path.startsWith("/")) {
      path = "/" + path
    }

    // Try to serve static file
    const filePath = `./dist${path}`
    const file = Bun.file(filePath)
    if (await file.exists()) {
      const ext = path.split(".").pop() || ""
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
