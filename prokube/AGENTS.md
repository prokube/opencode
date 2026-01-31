# OpenCode Prefixable UI - Agent Instructions

## Project Overview

This directory contains the **prefix-aware Web UI** for OpenCode that runs in Kubeflow Notebooks. It allows OpenCode to be deployed under any URL prefix (e.g., `/notebook/namespace/name/`).

### Directory Structure

```
prokube/
├── app-prefixable/     # SolidJS frontend with runtime prefix detection
│   ├── src/
│   │   ├── components/ # Reusable UI components
│   │   ├── context/    # React-like contexts (SDK, Events, Providers, MCP)
│   │   ├── pages/      # Page components (Session, Settings, Layout)
│   │   └── utils/      # Utility functions (path handling, etc.)
│   ├── build.ts        # Build script
│   └── package.json
├── docker/             # Docker image for Kubeflow deployment
│   ├── Dockerfile      # Multi-stage build: Bun UI server + OpenCode API
│   ├── Makefile        # Build and push commands
│   ├── serve-ui.ts     # Bun server that proxies API and serves static files
│   ├── start-server.sh # Entrypoint script
│   └── s6/             # s6-overlay service definitions
└── AGENTS.md           # This file
```

## Branding

- The product name is **prokube.ai** (always lowercase, with ".ai" suffix)
- Never write "ProKube", "Prokube", or "prokube" without the ".ai" suffix in user-facing text

## Architecture

```
Kubeflow Pod (Port 8888)
├── Bun UI Server (serve-ui.ts)
│   ├── Serves static files from /opt/opencode-ui/dist
│   ├── Injects NB_PREFIX into index.html at runtime
│   └── Proxies /session, /event, /api/* to localhost:4096
└── OpenCode API Server (Port 4096)
    └── Runs internally, not exposed externally
```

### Key Concepts

1. **Runtime Prefix Detection**: The UI detects its base path at runtime from `window.location`, not at build time
2. **API Proxy**: All API requests go through the Bun server which strips the prefix before forwarding
3. **SSE Events**: Server-Sent Events are proxied for real-time updates

## Environment Variables

| Variable    | Default                 | Description            |
| ----------- | ----------------------- | ---------------------- |
| `BASE_PATH` | `/`                     | URL prefix for the app |
| `PORT`      | `3000`                  | Dev server port        |
| `API_URL`   | `http://localhost:4096` | Backend API URL        |

## Local Development

For local development, run the backend and frontend separately in a fresh working directory:

### 1. Start OpenCode API Server

```bash
# Create a fresh test directory and start the API server
mkdir -p /tmp/opencode-test && cd /tmp/opencode-test
opencode server
# Or from source:
cd packages/opencode && bun dev
```

The API server runs on `http://localhost:4096`.

### 2. Start Frontend Dev Server

```bash
cd prokube/app-prefixable
bun install
bun run dev
```

The dev server runs on `http://localhost:3000` and proxies API requests to the backend.

## CI/CD

Docker image builds and cluster deployments are handled by **GitLab CI**. Do not build Docker images locally - push your changes and let the CI pipeline handle it.

## Code Guidelines

### HTTP Base Path Configuration

**CRITICAL**: Never hardcode paths in the frontend code!

```typescript
// CORRECT - Use prefix() from base-path context
import { useBasePath } from "../context/base-path"
const { prefix } = useBasePath()
const url = prefix("/api/session")

// CORRECT - Use serverUrl from path utils for SDK
import { serverUrl } from "../utils/path"
const client = createClient({ serverUrl })

// WRONG - Hardcoded path
fetch("/api/session")

// WRONG - Hardcoded prefix
fetch("/notebook/ns/name/api/session")
```

### API Requests

Always use the SDK client from context:

```typescript
import { useSDK } from "../context/sdk"

function MyComponent() {
  const { client } = useSDK()

  // Use client methods
  const sessions = await client.session.list({})
}
```

### Error Handling

Display API errors to users - never fail silently:

```typescript
// Messages with errors should show the error
if (message.error) {
  // Display error in UI
}

// Check for model selection before sending
if (!providers.selectedModel) {
  setError("Please select a model first")
  return
}
```

### Agent and Model Selection

- Always send an agent in prompt requests (default: `"build"`)
- Require explicit model selection to avoid auto-selection of broken providers

## Git Workflow

### Feature Branches

```bash
# Check current branch
git branch --show-current

# Create feature branch if needed
git checkout -b feature/descriptive-name
```

### Commits

```bash
# Stage specific files only (NEVER use git add -A or git add .)
git add prokube/app-prefixable/src/pages/session.tsx

# Commit with descriptive message
git commit -m "fix(prokube): description of what changed"
```

### Commit Message Format

- `feat(prokube):` New feature
- `fix(prokube):` Bug fix
- `refactor(prokube):` Code restructure
- `docs(prokube):` Documentation
- `chore(prokube):` Maintenance

### When to Push

**Do NOT push automatically after every commit.** Pushing triggers CI builds.

- **Push only** when the user explicitly requests it, or when a feature is complete and ready for testing in the cluster
- For local development and testing, commit locally but wait for user approval before pushing
- If unsure, ask the user: "Should I push these changes now?"

## Cluster Debugging

When debugging issues in the cluster:

```bash
# Check pod logs
kubectl logs <pod-name> -n <namespace> -c <container>

# Execute commands in pod
kubectl exec <pod-name> -n <namespace> -c <container> -- <command>

# Check OpenCode internal logs
kubectl exec <pod> -n <ns> -c <container> -- cat ~/.local/share/opencode/log/*.log
```

## Troubleshooting

### Common Issues

1. **"Thinking" appears but no response**
   - Check OpenCode logs for errors: `~/.local/share/opencode/log/*.log`
   - Verify agent is being sent in request
   - Check if provider credentials are valid

2. **Wrong provider auto-selected**
   - AWS env vars from MinIO can trigger false Bedrock detection
   - Solution: Always require explicit model selection

3. **API requests fail with 404**
   - Check that base path is being included
   - Verify proxy is stripping prefix correctly

### Debug Endpoints

```bash
# Check session status
curl http://127.0.0.1:4096/session/status

# Check available providers
curl http://127.0.0.1:4096/provider

# Check session messages
curl http://127.0.0.1:4096/session/<session-id>/message
```

## Fork & Upstream Sync Strategy

This project is a fork of the upstream OpenCode repository. To ensure smooth upstream updates, follow these rules:

### Golden Rule: Never Modify Upstream Files

**ONLY add new files. NEVER modify existing upstream files.**

This means:

- All prokube code goes in `prokube/` directory (NEW files only)
- Do NOT modify `packages/app/`, `packages/ui/`, `packages/opencode/`, etc.
- Do NOT modify root `package.json` or `pnpm-workspace.yaml`

### Why This Matters

When rebasing on upstream:

- **New files** = No conflicts, ever
- **Modified files** = Potential merge conflicts on every rebase

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
│   ├── app-prefixable/
│   └── docker/
│
├── package.json               # UPSTREAM - DO NOT TOUCH
└── pnpm-workspace.yaml        # UPSTREAM - DO NOT TOUCH
```

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

## Session Completion

When ending a work session:

1. **Commit changes**: Stage specific files, commit with clear message
2. **Ask before pushing**: Only push if user confirms or explicitly requests it
3. **Provide context**: Summarize what was done and what's next

