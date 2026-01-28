## Add `--base-path` support for reverse proxy deployments

### Summary

This PR adds support for running OpenCode behind a reverse proxy with a URL path prefix (e.g., `/notebook/namespace/name/`). This is essential for environments like Kubeflow Notebooks, Kubernetes Ingress with path-based routing, or shared servers running multiple services.

### Motivation

When deploying OpenCode in Kubeflow, the application runs under a URL prefix set by `NB_PREFIX` (e.g., `/notebook/demo-user1/opencode/`). Without base-path support, all assets, API calls, and navigation fail because they use absolute paths starting with `/`.

### Usage

```bash
# CLI flag
opencode web --base-path /notebook/namespace/name/

# Environment variable
OPENCODE_BASE_PATH=/prefix opencode web

# Config file (opencode.json)
{
  "server": {
    "basePath": "/prefix"
  }
}
```

### Changes

| File | Description |
|------|-------------|
| `src/util/base-path.ts` | New utility for path normalization |
| `src/config/config.ts` | Added `basePath` to server config schema |
| `src/cli/network.ts` | Added `--base-path` CLI option |
| `src/cli/cmd/web.ts` | Display base path in startup message |
| `src/cli/cmd/serve.ts` | Display base path in startup message |
| `src/server/server.ts` | Route mounting, HTML/JS/CSS runtime patching |
| `src/cli/cmd/tui/worker.ts` | Use `Server.url()` with basePath |
| `src/cli/cmd/tui/spawn.ts` | Use `Server.url()` with basePath |
| `packages/app/src/app.tsx` | Frontend basePath support |
| `Dockerfile` | Added `gcompat` for PTY terminal support |
| `README.md` | Documentation |
| `test/util/base-path.test.ts` | Unit tests |

### Technical Details

Since the frontend is served from `app.opencode.ai`, runtime patching is required:

- **HTML**: Rewrite asset paths (`href`, `src`, `content` attributes)
- **JavaScript**: Patch Vite's base function, patch `window.location.origin` for API calls
- **CSS**: Rewrite font URLs (`url(/assets/...)`)
- **History API**: Wrap `pushState`/`replaceState` for client-side routing

### Testing

- ✅ 634 unit tests passing
- ✅ Tested locally with `bun dev`
- ✅ Tested in Kubeflow Notebooks with `NB_PREFIX`
- ✅ Docker multi-platform build (linux/amd64, linux/arm64)

### Breaking Changes

None. Default behavior (no base path) is unchanged.
