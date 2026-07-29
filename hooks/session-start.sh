#!/usr/bin/env bash
# ds-orchestra session-start hook
# Prints delegation reminders into the session context.
# This fires before every Claude Code session — the output is injected as context.

cat << 'EOF'
## ds-orchestra Available

You have ds-orchestra workers available for implementation tasks.

**Before writing implementation code**, check: does this task match the routing table in CLAUDE.md?

If yes:
1. Write the failing tests
2. Call ds_dispatch with the goal, acceptance command, and mayEdit globs
3. Monitor with ds_status / ds_tail
4. Audit the diff before ds_accept

**Available tools:** ds_dispatch, ds_status, ds_tail, ds_diff, ds_abort, ds_wait_all, ds_accept, ds_reject

**Permission tuning:** The worker may need expanded mayEdit, bashAllow, maxSteps, or maxSeconds. If it gets blocked, re-dispatch with adjusted permissions rather than implementing yourself.

The worker ✓ Can read source and config files ✗ Cannot read test files or .env ✗ Cannot write to tests/ or config files ✓ Runs acceptance command independently
EOF
