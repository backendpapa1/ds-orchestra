# ds-orchestra

**NestJS MCP server that lets Claude Code (Opus) delegate implementation work to DeepSeek workers under enforced constraints.**

Claude retains design authority. DeepSeek implements against a closed-form contract in an isolated git worktree. Every guardrail is enforced in code, not in a prompt.

## Install

### curl (recommended)
```bash
curl -fsSL https://github.com/backendpapa1/ds-orchestra/releases/latest/download/install.sh | bash
```

### npm
```bash
npm install -g ds-orchestra
```

### Manual (inspect before running)
```bash
curl -fsSL https://github.com/ds-orchestra/releases/latest/download/install.sh -o install.sh
# Inspect the script
bash install.sh
```

### Verify
```bash
ds-orchestra --version
```

## Quick Start

```bash
# 1. Save your DeepSeek API key
ds-orchestra config set api_key sk-your-key-here

# 2. Initialize in your repository
cd your-project
ds-orchestra init

# 3. Restart Claude Code to load the MCP server

# 4. Write failing tests in tests/

# 5. Delegate implementation via ds_dispatch in Claude Code
```

## How It Works

```
Claude Code (Opus)
   │  MCP stdio · JSON-RPC
   ▼
ds-orchestra
   │
   ├── Creates isolated git worktree (never touches your working tree)
   ├── Enforces file write allowlist (worker CANNOT touch tests/)
   ├── Enforces command allowlist (only safe commands permitted)
   ├── Runs DeepSeek agent loop (read → write → test → submit)
   └── Independently verifies acceptance (doesn't trust the worker)
```

### Workflow

1. **Claude writes tests** — the worker cannot edit `tests/`
2. **Claude dispatches** with a closed-form spec + acceptance command
3. **Worker implements** in an isolated git worktree on branch `ds/<taskId>`
4. **Worker submits** → finalization runs independently (acceptance command + test-diff check)
5. **Claude audits** the diff via `ds_diff`
6. **Claude accepts** (squash-merge) or **rejects** (cleanup)

### Guardrails

- **File sandbox**: `neverTouch` (tests, config, locks) always wins over `mayEdit`
- **Command sandbox**: First token must be in `bashAllow`. Chained dangerous commands blocked.
- **Path traversal**: Resolved paths must stay within the worktree root
- **Budget caps**: `maxSteps`, `maxSeconds`, `maxFilesTouched`
- **Finalization**: Acceptance command runs independently. Test modifications detected.

## MCP Tools

| Tool | Description |
|---|---|
| `ds_dispatch` | Dispatch a task — returns immediately with taskId |
| `ds_status` | Get current status, steps, files touched |
| `ds_tail` | Raw JSONL event log entries |
| `ds_diff` | Full diff of worker changes |
| `ds_abort` | Terminate at next step boundary |
| `ds_wait_all` | Wait for multiple parallel tasks |
| `ds_accept` | Squash-merge and cleanup (review first!) |
| `ds_reject` | Cleanup without merging |

## CLI

```
ds-orchestra config set <key> <value>  # Save API key, model, concurrency
ds-orchestra config get <key>          # Read a config value
ds-orchestra config list               # Show all settings
ds-orchestra config unset <key>        # Remove a config value
ds-orchestra init                      # Set up in current repo (idempotent)
ds-orchestra update                    # Refresh managed block and INSTRUCTIONS.md
ds-orchestra status                    # Show version, config, MCP state
ds-orchestra gc                        # Clean up orphaned worktrees
ds-orchestra uninstall                 # Remove from repo
```

Config keys: `api_key`, `model`, `max_concurrent`, `state_dir`, `thinking`

## Configuration

Settings are stored in `~/.ds-orchestra/config.yaml`. Environment variables override config file values.

### Config file (recommended)

```bash
ds-orchestra config set api_key sk-your-key-here
ds-orchestra config set model deepseek-v4-pro
ds-orchestra config set max_concurrent 3
ds-orchestra config list
```

### Environment variables

| Env var | Config key | Default |
|---|---|---|
| `DEEPSEEK_API_KEY` | `api_key` | — |
| `DEEPSEEK_MODEL` | `model` | `deepseek-v4-flash` |
| `DS_MAX_CONCURRENT` | `max_concurrent` | `5` |
| `DS_STATE_DIR` | `state_dir` | `~/.ds-orchestra` |
| `DS_WORKER_THINKING` | `thinking` | `false` |

> **Note**: `deepseek-chat` and `deepseek-reasoner` were retired July 24, 2026. Only `deepseek-v4-flash` and `deepseek-v4-pro` are supported.

## Uninstall

```bash
# Per-repo
ds-orchestra uninstall

# Globally
npm uninstall -g ds-orchestra
claude mcp remove ds-orchestra
```

## Requirements

- Node.js 20+
- Git
- DeepSeek API key
- Claude Code (for MCP integration)

## Architecture

```
src/
├── main-mcp.ts              # MCP server entrypoint
├── main-cli.ts              # CLI entrypoint
├── config/                  # Zod-validated env config
├── logger/                  # Stderr-only logger
├── services/
│   ├── sandbox/             # Security boundary (path + bash guards)
│   ├── worktree/            # Git worktree isolation
│   ├── worker/              # DeepSeek agent loop + 6 tools
│   ├── orchestrator/        # Facade + WaveScheduler
│   └── run-registry/        # In-memory state + JSONL event log
├── mcp/                     # MCP server factory + 8 tool registrations
├── cli/                     # CLI commands + managed block writer
└── shared/                  # Contracts, types, utilities
```

## License

MIT
