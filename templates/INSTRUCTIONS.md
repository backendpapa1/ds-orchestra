# ds-orchestra — Orchestration Guide

> This file is managed by `ds-orchestra update`. Do not edit manually.
> Local overrides belong in `CLAUDE.md` outside the managed block.

---

## What ds-orchestra Does

Delegates bulk implementation work to a DeepSeek worker running in an isolated git worktree. The worker CAN read source files, config files, and docs to understand the project — but CANNOT touch tests, secrets, or files outside the `mayEdit` globs you specify.

**You write the tests. The worker writes the implementation. You audit and merge.**

---

## Full Workflow

### Step 1: Write Failing Tests

Write comprehensive tests that define the contract. The worker:
- **CANNOT read test files** — prevents it from seeing assertions and hardcoding answers
- **CANNOT write to test files** — prevents it from modifying the contract
- **CAN read config files** (package.json, tsconfig, lock files) — needs these to understand the project

### Step 2: Scope the Task

Use Glob/Grep/LS to understand what files the implementation should touch. **Decide whether to delegate before reading source files.** If you need to read every source file to write the spec, implement it yourself.

### Step 3: Dispatch

Call `ds_dispatch` with these parameters:

| Parameter | Required | Purpose |
|---|---|---|
| `repo` | Yes | Absolute path to the git repository |
| `goal` | Yes | Closed-form spec. Exact signatures, edge cases, expected behavior. |
| `context` | No | Conversation context for the worker. Inject scope boundaries, rationale, what NOT to touch, user preferences, rejected alternatives, and explicit guardrails. Helps prevent out-of-scope changes. |
| `acceptanceCmd` | Yes | Shell command that exits 0 on success. Must work in the isolated worktree. |
| `mayEdit` | Yes | Glob patterns the worker can write to. Be narrow. Adjust based on scope. |
| `maxSteps` | No | Max agent steps (default 40). Increase for complex multi-file work. |
| `maxSeconds` | No | Time budget in seconds (default 900 = 15min). Increase for long builds. |

**Permission tuning** — adjust these per-task based on what the worker actually needs:

```
# Narrow — single file fix
mayEdit: ["src/utils/formatDate.ts"]

# Broader — feature across a module  
mayEdit: ["src/feature-a/**", "src/shared/types.ts"]

# Full source access — refactoring
mayEdit: ["src/**"]

# Custom bash commands — project uses pnpm
bashAllow: ["pnpm", "node", "tsc", "vitest", "eslint", "ls", "cat"]

# Complex work needs more steps
maxSteps: 60
maxSeconds: 1800
```

**If the worker gets blocked** by a sandbox violation (e.g., tries to read a file it needs but can't, or run a command that's not allowlisted), don't abort — re-dispatch with adjusted permissions.

### Step 4: Supervise

The worker runs asynchronously. Poll these tools to monitor:

- `ds_status` — summary: steps completed, files written, current status
- `ds_tail` — raw event log entries for debugging what the worker is doing right now
- `ds_wait_all` — block until one or more tasks complete (for parallel dispatch)

You can `ds_abort` at any time with a reason. The worker stops at the next step boundary.

**Status values:**
- `running` — still working
- `passed` — acceptance command passed AND no test files modified
- `failed` — acceptance failed OR tests were modified
- `violated` — worker tripped a sandbox guardrail
- `aborted` — you cancelled it

### Step 5: Audit

**Never skip this step.** Call `ds_diff` to get the full diff. Review:

- [ ] Every changed line
- [ ] No test files modified (`testsModified` is empty)
- [ ] No hardcoded values that satisfy assertions without real implementation
- [ ] Implementation matches the spec
- [ ] No unnecessary changes outside `mayEdit`
- [ ] The acceptance command passes when you run it

### Step 6: Accept or Reject

- `ds_accept` — squash-merges the worker branch into your current branch, then cleans up the worktree and branch. **Irreversible** — audit first.
- `ds_reject` — cleans up without merging. Use when the implementation is wrong.

---

## Effort Level and Delegation

**At ANY effort level (low/medium/high/max), delegate implementation to ds-orchestra.** Your effort should go into:
- Test quality — comprehensive, edge-case-covering tests
- Specification clarity — `goal` that leaves no ambiguity
- Context injection — scope boundaries, rationale, guardrails
- Diff review — reading every line the worker changed

Implementation done by the worker + thorough audit by you is MORE thorough than you implementing alone — you catch details you'd miss when you're the author of the code.

If you find yourself reading source files to scope a task — stop. Write the tests, write the context, call `ds_dispatch`. You're not being lazy; you're being systematic.

---

## When to Use ds-orchestra

**Good candidates:**
- Feature implementation with clear acceptance criteria (tests already written)
- Boilerplate/scaffold generation
- Mechanical refactoring with well-defined scope
- Data migration scripts
- "Fill in the implementation to make these tests pass"

**Bad candidates:**
- Design work (architecture, API design, naming conventions)
- Test authorship (tests are the contract — you write them)
- Exploratory work (if you don't know the solution shape, you can't write a closed-form spec)
- Single-line fixes (dispatch overhead > work)
- Tightly coupled changes spanning many unrelated modules

---

## Parallel Dispatch

Run independent tasks simultaneously with non-overlapping `mayEdit`:

```
ds_dispatch: mayEdit=["src/feature-a/**"] → taskId: abc12345
ds_dispatch: mayEdit=["src/feature-b/**"] → taskId: def67890
ds_wait_all: taskIds=["abc12345", "def67890"]
```

If `mayEdit` globs overlap, the second dispatch is rejected with the conflicting taskId — sequence them instead.

---

## Troubleshooting

### Worker violated: "Read blocked: matches denylist"
The worker tried to read a test file or .env. This is by design — the worker cannot see test assertions. Your tests should be clear enough that the acceptance command is sufficient guidance.

### Worker violated: "not in mayEdit"
The spec requires changes to files outside `mayEdit`. Re-dispatch with broader `mayEdit`.

### Worker violated: "not in bashAllow"
The worker needs a command not in the allowlist (e.g., `pnpm`). Re-dispatch with `bashAllow` including that command. The allowlist is per-task — you control it.

### Worker violated: "maxSteps exceeded"
The task is more complex than anticipated. Re-dispatch with higher `maxSteps`.

### Worker failed: acceptance command failed
Read the diff — the worker may have written incorrect code, or the acceptance command may need adjustment. Fix and re-dispatch.

### Worker summary starts with "BLOCKED:"
The spec is ambiguous. The worker is telling you it can't proceed without clarification. Refine the `goal` and re-dispatch.

### Overlap error on dispatch
An active task's `mayEdit` intersects with yours. Wait for it to complete, narrow your `mayEdit`, or sequence the tasks.

### Orphaned worktrees after crash
The server keeps state in memory — a restart orphans worktrees. Run `ds-orchestra gc` to clean up.

---

## Model Selection

- Default: `deepseek-v4-flash` — fast, good for routine implementation
- For complex tasks: `deepseek-v4-pro` — stronger reasoning, better tool-call reliability
- Configure with: `ds-orchestra config set model deepseek-v4-pro`
- Thinking mode is OFF by default (required for temperature=0)
