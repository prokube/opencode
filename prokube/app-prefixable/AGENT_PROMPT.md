# Coding Agent Prompt: Prefix-Aware Web UI for OpenCode

## Objective

Create a new, prefix-aware Web UI for OpenCode that can be deployed under any URL path prefix (e.g., `/opencode/`, `/tools/ai/`, etc.). This UI should achieve feature parity with the existing `packages/app` but be designed from the ground up to support dynamic base paths.

---

## Background & Context

### Current Architecture

The existing OpenCode Web UI is located in `packages/app` and uses:

- **Framework**: SolidJS
- **Build Tool**: Vite
- **Styling**: TailwindCSS
- **Routing**: `@solidjs/router`

The backend API server runs on port 4096 and exposes:

- REST endpoints for sessions, providers, config, etc.
- SSE endpoint `/event` for real-time updates
- OpenAPI spec at `/doc`

### Problem with Current Setup

Making Vite-based apps prefix-aware retroactively is painful because:

1. Vite's `base` option requires rebuild for each prefix
2. Assets, router, and API calls all need separate handling
3. Hot-reload breaks in dev mode with prefixes
4. Many hardcoded `/` paths throughout the codebase

### Solution

Build a new UI package from scratch that:

1. Uses **Bun Bundler** instead of Vite (native `publicPath` support)
2. Reads the prefix at **runtime** (not build-time)
3. Uses relative paths where possible
4. Has a single injection point for the base path

---

## Technical Requirements

### 1. Package Setup

Create the new UI in the top-level `prokube/` directory (separate from upstream `packages/`):

```
prokube/app-prefixable/
├── src/
│   ├── index.html          # HTML template with base path injection
│   ├── entry.tsx           # Main entry point
│   ├── app.tsx             # Root app component
│   ├── context/
│   │   ├── base-path.tsx   # Base path context provider
│   │   ├── sdk.tsx         # SDK context (reuse from packages/app)
│   │   └── ...             # Other contexts as needed
│   ├── pages/
│   │   ├── home.tsx
│   │   ├── session.tsx
│   │   └── layout.tsx
│   ├── components/
│   │   └── ...             # Reuse from packages/ui where possible
│   └── utils/
│       └── path.ts         # Path utilities for prefix handling
├── build.ts                # Bun build script
├── dev.ts                  # Development server script
├── package.json
└── tsconfig.json
```

### 2. Build Configuration (`build.ts`)

```typescript
import { $ } from "bun"

const BASE_PATH = process.env.BASE_PATH || "/"

await Bun.build({
  entrypoints: ["./src/index.html"],
  outdir: "./dist",
  publicPath: BASE_PATH,
  minify: process.env.NODE_ENV === "production",
  splitting: true,
  sourcemap: "linked",
  define: {
    "import.meta.env.BASE_PATH": JSON.stringify(BASE_PATH),
  },
})

// Copy static assets
await $`cp -r ./public/* ./dist/`
```

### 3. Runtime Base Path Detection

The UI should support multiple ways to determine the base path:

```typescript
// src/utils/path.ts
export function getBasePath(): string {
  // Priority order:
  // 1. Explicit config in window.__OPENCODE__
  // 2. <base href="..."> tag
  // 3. Build-time injected value
  // 4. Auto-detect from current URL

  if (typeof window !== "undefined") {
    // From global config
    if (window.__OPENCODE__?.basePath) {
      return normalizeBasePath(window.__OPENCODE__.basePath)
    }

    // From <base> tag
    const baseTag = document.querySelector("base")
    if (baseTag?.href) {
      const url = new URL(baseTag.href)
      return normalizeBasePath(url.pathname)
    }
  }

  // Build-time value
  if (import.meta.env.BASE_PATH) {
    return normalizeBasePath(import.meta.env.BASE_PATH)
  }

  return "/"
}

export function normalizeBasePath(path: string): string {
  // Ensure leading slash, trailing slash
  let normalized = path.trim()
  if (!normalized.startsWith("/")) normalized = "/" + normalized
  if (!normalized.endsWith("/")) normalized = normalized + "/"
  return normalized
}

export function prefixPath(path: string, basePath: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path // Absolute URLs unchanged
  }
  const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath
  const suffix = path.startsWith("/") ? path : "/" + path
  return base + suffix
}
```

### 4. Base Path Context

```typescript
// src/context/base-path.tsx
import { createContext, useContext, type ParentProps } from "solid-js"
import { getBasePath, prefixPath } from "../utils/path"

interface BasePathContextValue {
  basePath: string
  prefix: (path: string) => string
  apiUrl: string
}

const BasePathContext = createContext<BasePathContextValue>()

export function BasePathProvider(props: ParentProps & { apiUrl?: string }) {
  const basePath = getBasePath()

  const value: BasePathContextValue = {
    basePath,
    prefix: (path: string) => prefixPath(path, basePath),
    apiUrl: props.apiUrl || deriveApiUrl(basePath),
  }

  return (
    <BasePathContext.Provider value={value}>
      {props.children}
    </BasePathContext.Provider>
  )
}

export function useBasePath() {
  const ctx = useContext(BasePathContext)
  if (!ctx) throw new Error("useBasePath must be used within BasePathProvider")
  return ctx
}

function deriveApiUrl(basePath: string): string {
  // If running on same origin, API is at origin root
  // Otherwise, check for explicit config
  if (window.__OPENCODE__?.serverUrl) {
    return window.__OPENCODE__.serverUrl
  }
  return window.location.origin
}
```

### 5. Router Configuration

```typescript
// src/app.tsx
import { Router, Route } from "@solidjs/router"
import { useBasePath } from "./context/base-path"

export function App() {
  const { basePath } = useBasePath()

  return (
    <Router base={basePath.slice(0, -1)}> {/* Router wants no trailing slash */}
      <Route path="/" component={Home} />
      <Route path="/session/:id?" component={Session} />
      <Route path="/settings" component={Settings} />
    </Router>
  )
}
```

### 6. HTML Template

```html
<!-- src/index.html -->
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OpenCode</title>
    <!-- Base path will be injected here by server or set statically -->
    <base href="/" />
    <link rel="icon" type="image/svg+xml" href="./favicon.svg" />
  </head>
  <body>
    <div id="root"></div>
    <script>
      // Runtime configuration injection point
      window.__OPENCODE__ = window.__OPENCODE__ || {}
      // Server can inject: window.__OPENCODE__.basePath = "/my-prefix/";
      // Server can inject: window.__OPENCODE__.serverUrl = "http://localhost:4096";
    </script>
    <script type="module" src="./entry.tsx"></script>
  </body>
</html>
```

### 7. Development Server (`dev.ts`)

```typescript
import { watch } from "fs"

const BASE_PATH = process.env.BASE_PATH || "/"
const PORT = process.env.PORT || 3000

// Build initially
await import("./build")

// Start dev server
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    let path = url.pathname

    // Strip base path prefix for file lookup
    if (path.startsWith(BASE_PATH)) {
      path = path.slice(BASE_PATH.length - 1) || "/"
    }

    // Try to serve static file
    const file = Bun.file(`./dist${path}`)
    if (await file.exists()) {
      return new Response(file)
    }

    // SPA fallback - serve index.html
    const indexHtml = await Bun.file("./dist/index.html").text()
    const injected = indexHtml.replace('<base href="/">', `<base href="${BASE_PATH}">`)
    return new Response(injected, {
      headers: { "Content-Type": "text/html" },
    })
  },
})

console.log(`Dev server running at http://localhost:${PORT}${BASE_PATH}`)

// Watch for changes and rebuild
watch("./src", { recursive: true }, async () => {
  console.log("Rebuilding...")
  await import("./build")
  console.log("Done")
})
```

### 8. Server-Side Integration

The Hono backend server should serve the UI with the correct base path. Add to `packages/opencode/src/server/server.ts`:

```typescript
// Serve UI with base path support
app.get("/*", async (c) => {
  const basePath = Flag.OPENCODE_UI_BASE_PATH || "/"

  // Read and inject base path into index.html
  const indexHtml = await Bun.file("path/to/dist/index.html").text()
  const injected = indexHtml
    .replace('<base href="/">', `<base href="${basePath}">`)
    .replace(
      "window.__OPENCODE__ = window.__OPENCODE__ || {};",
      `window.__OPENCODE__ = { basePath: "${basePath}", serverUrl: "${serverUrl}" };`,
    )

  return c.html(injected)
})
```

---

## Feature Parity Checklist

The new UI must support all features from the existing `packages/app`:

### Core Features

- [ ] Session list and management
- [ ] Chat interface with message streaming
- [ ] Code blocks with syntax highlighting
- [ ] Diff viewer for file changes
- [ ] Markdown rendering

### Settings & Configuration

- [ ] Provider configuration (API keys, models)
- [ ] Model selection dialog
- [ ] MCP server configuration
- [ ] Keybinds settings
- [ ] Permissions settings
- [ ] Agent configuration

### UI Components

- [ ] Command palette
- [ ] File tree
- [ ] Terminal integration
- [ ] Toast notifications
- [ ] Dialogs (confirm, prompt, select)
- [ ] Tooltips and hover cards

### Contexts to Implement

Reuse or port from `packages/app/src/context/`:

- [ ] `server.tsx` - Server connection management
- [ ] `sdk.tsx` - SDK client wrapper
- [ ] `settings.tsx` - User settings persistence
- [ ] `permission.tsx` - Permission handling
- [ ] `terminal.tsx` - Terminal integration
- [ ] `file.tsx` - File operations
- [ ] `prompt.tsx` - Prompt input handling
- [ ] `command.tsx` - Command system
- [ ] `notification.tsx` - Notifications
- [ ] `language.tsx` - i18n

---

## Shared UI Components

Reuse components from `packages/ui/` where possible:

- Button, Dialog, Tabs, Select, etc.
- Markdown renderer
- Diff viewer
- Code blocks
- Theme system
- i18n utilities

Import like:

```typescript
import { Button } from "@opencode-ai/ui/button"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Markdown } from "@opencode-ai/ui/markdown"
```

---

## Testing the Prefix

Test with different base paths:

```bash
# Default (root)
bun run dev

# With prefix
BASE_PATH=/opencode/ bun run dev

# With nested prefix
BASE_PATH=/tools/ai/opencode/ bun run dev
```

Verify:

1. All assets load correctly
2. Router navigation works
3. API calls reach the backend
4. Page refresh maintains correct path
5. Direct URL access works

---

## Key Principles

1. **No hardcoded absolute paths** - Always use the `prefix()` helper or relative paths
2. **Runtime configuration** - Base path should be configurable without rebuild
3. **Graceful fallback** - If no base path configured, default to `/`
4. **Asset path consistency** - All assets (JS, CSS, images, fonts) must use prefixed paths
5. **API separation** - API URL is separate from UI base path

---

## CLI Flags for Server

Add these flags to the OpenCode server:

```typescript
// In Flag module
export const OPENCODE_UI_BASE_PATH = process.env.OPENCODE_UI_BASE_PATH || "/"
export const OPENCODE_UI_ENABLED = process.env.OPENCODE_UI_ENABLED !== "false"
```

Usage:

```bash
opencode server --ui-base-path=/opencode/ --port=4096
```

---

## Deliverables

1. New UI at `prokube/app-prefixable/`
2. Build script using Bun bundler
3. Development server with hot reload
4. Full feature parity with existing UI
5. Documentation for deployment with custom prefixes
6. Integration with existing Hono server

---

## Resources

- Existing UI: `packages/app/src/`
- Shared UI components: `packages/ui/src/`
- SDK: `packages/sdk/js/src/`
- Server: `packages/opencode/src/server/`
- Bun Bundler docs: https://bun.sh/docs/bundler
- SolidJS Router: https://docs.solidjs.com/solid-router

---

## Fork & Upstream Sync Strategy

This project is a fork of the upstream OpenCode repository. To ensure smooth upstream updates, follow these **critical rules**:

### Golden Rule: Never Modify Upstream Files

**ONLY add new files. NEVER modify existing upstream files.**

This means:

- Create `prokube/app-prefixable/` as a NEW directory
- Do NOT modify `packages/app/`, `packages/ui/`, `packages/opencode/`, etc.
- Do NOT modify `package.json` in the root (use a separate workspace config if needed)

### Why This Matters

When rebasing on upstream:

- **New files** = No conflicts, ever
- **Modified files** = Potential merge conflicts on every rebase

### Wrapper Pattern for Upstream Components

If you need to modify behavior of an upstream component, create a wrapper:

```typescript
// WRONG: Modifying packages/ui/src/components/button.tsx
// This will cause rebase conflicts!

// CORRECT: Create prokube/app-prefixable/src/components/button.tsx
import { Button as UpstreamButton, type ButtonProps } from "@opencode-ai/ui/button"
import { useBasePath } from "../context/base-path"

export function Button(props: ButtonProps & { href?: string }) {
  const { prefix } = useBasePath()

  const href = props.href ? prefix(props.href) : undefined

  return <UpstreamButton {...props} href={href} />
}
```

### Extending Upstream Contexts

Same pattern for contexts:

```typescript
// prokube/app-prefixable/src/context/sdk.tsx
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import { useBasePath } from "./base-path"

// Wrap the upstream SDK with your prefix-aware logic
export function useSDK() {
  const { apiUrl } = useBasePath()

  return createOpencodeClient({
    baseUrl: apiUrl,
    // ... your config
  })
}
```

### Directory Structure

```
opencode/                      # Fork of upstream
├── packages/                  # UPSTREAM - DO NOT TOUCH
│   ├── app/
│   ├── ui/
│   ├── opencode/
│   └── sdk/
│
├── prokube/                   # YOUR CODE - Safe to modify
│   └── app-prefixable/
│       ├── src/
│       ├── build.ts
│       └── package.json
│
├── package.json               # UPSTREAM - DO NOT TOUCH
└── pnpm-workspace.yaml        # UPSTREAM - If you must add workspace, see below
```

### If You Must Modify Root Config

If you absolutely need to add `prokube/app-prefixable` to the workspace, create a separate file:

```yaml
# pnpm-workspace.prokube.yaml (NEW FILE)
packages:
  - "packages/*"
  - "prokube/*"
```

Then use: `pnpm install --workspace-file=pnpm-workspace.prokube.yaml`

Or, add the package to `.gitignore` patterns that won't conflict.

### Rebase Workflow

```bash
# 1. Fetch upstream
git fetch upstream

# 2. Rebase your branch onto upstream/dev
git rebase upstream/dev

# 3. If you followed the rules: zero conflicts
# 4. Force push to your fork
git push --force-with-lease origin your-branch
```

### Testing After Rebase

After each rebase, verify:

1. `prokube/app-prefixable` still builds
2. Imports from `@opencode-ai/ui` still resolve
3. SDK types are still compatible
4. No breaking changes in upstream API

### Handling Breaking Upstream Changes

If upstream changes break your code:

1. **API changes in `@opencode-ai/sdk`**: Update your SDK usage in `app-prefixable`
2. **Component changes in `@opencode-ai/ui`**: Update your wrappers
3. **Server changes**: May need to adapt your server integration

Document any upstream version requirements in your package.json:

```json
{
  "name": "@prokube/app-prefixable",
  "peerDependencies": {
    "@opencode-ai/ui": ">=1.1.0",
    "@opencode-ai/sdk": ">=1.1.0"
  }
}
```

---

## Notes

- Prioritize correctness over performance initially
- Test with real OpenCode sessions, not just static pages
- Ensure SSE events work correctly through the proxy
- Consider CORS implications when API is on different origin
- **Always test rebase before pushing to ensure no conflicts**
