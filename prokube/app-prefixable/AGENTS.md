# Prefix-Aware Web UI for OpenCode

## Quick Start

### 1. Start the Backend (API Server)

```bash
cd /Users/henrik/local-repos/prokube/opencode/packages/opencode
bun run src/index.ts serve
```

This starts the headless API server on `http://localhost:4096`.

**Note:** `bun dev` starts the CLI/TUI, not the API server.

### 2. Start the Frontend (Dev Server)

```bash
cd /Users/henrik/local-repos/prokube/opencode/prokube/app-prefixable
bun run dev
```

Opens at `http://localhost:3000/`

#### With URL Prefix

```bash
BASE_PATH=/opencode/ bun run dev
```

Opens at `http://localhost:3000/opencode/`

### 3. Build for Production

```bash
bun run build
```

Output in `./dist/` - can be deployed under any prefix without rebuilding.

## Architecture

- **esbuild + esbuild-plugin-solid** for bundling
- **TailwindCSS 3.x** with ProKube `pk-*` component classes
- **Runtime prefix detection** via `window.__OPENCODE__.basePath`
- **SolidJS Router** with dynamic base path

## Key Files

| File                        | Purpose                             |
| --------------------------- | ----------------------------------- |
| `dev.ts`                    | Dev server with prefix injection    |
| `build.ts`                  | esbuild + PostCSS build             |
| `src/context/base-path.tsx` | Base path context provider          |
| `src/utils/path.ts`         | Path utilities and prefix detection |

## Environment Variables

| Variable    | Default                 | Description            |
| ----------- | ----------------------- | ---------------------- |
| `BASE_PATH` | `/`                     | URL prefix for the app |
| `PORT`      | `3000`                  | Dev server port        |
| `API_URL`   | `http://localhost:4096` | Backend API URL        |

## Routing Notes

- SolidJS Router handles the base path automatically
- Use plain paths in `<A href="/session">` - no manual prefixing needed
- The router base is set from `window.__OPENCODE__.basePath`
