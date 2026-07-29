#!/usr/bin/env bash
# ds-orchestra session-start hook
# Fires before every Claude Code session. Output is injected as context.

cat << 'EOF'
## ds-orchestra Active

Delegation tools available: ds_dispatch, ds_status, ds_tail, ds_diff, ds_abort, ds_wait_all, ds_accept, ds_reject.

**Effort level does not change delegation policy.** At any effort level (low/medium/high/max), delegate implementation work to ds-orchestra. Thoroughness comes from test quality, specification clarity, and diff review — not from implementing every line yourself. Writing implementation code manually is LESS thorough than delegating + auditing.

**Workflow:**
1. Write tests (you) → 2. ds_dispatch with context (you) → 3. Worker implements (DeepSeek) → 4. ds_diff audit (you) → 5. ds_accept (you)

**If the worker gets blocked** (sandbox violation, wrong mayEdit, missing contextual guidance) — re-dispatch with adjusted permissions rather than implementing yourself.
EOF
