# prokube.ai OpenCode Integration

This directory contains **prokube-specific customizations** for running OpenCode in Kubeflow Notebooks. All code here is designed to work alongside upstream OpenCode without modifying it.

## Architecture: Upstream vs. Prokube Code

```
opencode/                          # Fork of upstream OpenCode
│
├── packages/                      # ⛔ UPSTREAM CODE - DO NOT MODIFY
│   ├── app/                       #    Original React/SolidJS app
│   ├── opencode/                  #    Core backend (Go/Bun)
│   ├── sdk/                       #    TypeScript SDK
│   └── ui/                        #    Shared UI components
│
└── prokube/                       # ✅ PROKUBE CODE - Our customizations
    ├── app-prefixable/            #    Custom SolidJS frontend
    │   ├── src/
    │   │   ├── components/        #    UI components
    │   │   ├── context/           #    State management (SDK, MCP, etc.)
    │   │   ├── pages/             #    Page components
    │   │   └── utils/             #    Utilities (prokube-api.ts, etc.)
    │   └── dev.ts                 #    Dev server with prokube endpoints
    │
    └── docker/                    #    Kubeflow notebook image
        ├── serve-ui.ts            #    Production server with prokube endpoints
        └── Dockerfile
```

## Why This Separation?

| Aspect | Upstream (`packages/`) | Prokube (`prokube/`) |
|--------|------------------------|----------------------|
| **Ownership** | OpenCode maintainers | prokube.ai team |
| **Modifications** | Never by us | Freely modify |
| **Rebase conflicts** | None if untouched | None (new files only) |
| **Features** | Generic OpenCode | Kubeflow-specific |

## Prokube-Specific Features

These features are implemented entirely in the `prokube/` directory:

### 1. Runtime Prefix Detection
The UI detects `NB_PREFIX` at runtime, allowing deployment under any URL path without rebuilding.

### 2. Prokube API Endpoints
Custom endpoints in `serve-ui.ts` and `dev.ts` (not in upstream):

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/prokube/mkdir` | POST | Create directories recursively |
| `/api/prokube/list-dirs` | GET | List directories (2 levels deep) |

### 3. MCP Config Persistence
When adding MCP servers via UI, the config is persisted to the global config file (handled in `context/mcp.tsx`).

### 4. Session Sidebar
Right sidebar showing tasks/todos and git branch (in `components/session-sidebar.tsx`).

## Development

```bash
# Start backend (from a test directory)
mkdir -p /tmp/opencode-test && cd /tmp/opencode-test
opencode server

# Start frontend dev server
cd prokube/app-prefixable
bun run dev
```

## Detailed Documentation

- [AGENTS.md](./AGENTS.md) - Coding guidelines and architecture details
- [docker/README.md](./docker/README.md) - Kubeflow notebook image documentation
