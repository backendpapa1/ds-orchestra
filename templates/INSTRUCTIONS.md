# ds-orchestra — Orchestration Policy

> This file is managed by `ds-orchestra update`. Do not edit manually.
> Local overrides belong in `CLAUDE.md` outside the managed block.

---

## Full Workflow

### 1. Write Tests
Always write the failing tests yourself in `tests/`. The worker cannot modify test files — they are the contract. If tests pass before implementation starts, your tests are insufficient.

### 2. Scope the Task
Use Glob/Grep/LS to understand what files are involved. **Decide whether to delegate before reading source files.** If you need to read every file to write the spec, the task is too complex to delegate — implement it yourself.

### 3. Dispatch
Call `ds_dispatch` with:
- `repo`: Absolute path to the git repository
- `goal`: Closed-form spec — exact function signatures, expected behaviour, edge cases. Leave no design decisions open.
- `acceptanceCmd`: Shell command that exits 0 on success (e.g., `npx jest tests/feature.test.ts`)
- `mayEdit`: Narrow glob(s) the worker can modify. Be as narrow as possible.

The worker gets its own git worktree under `~/.ds-orchestra/wt/<taskId>`. Your working tree is never modified.

### 4. Supervise
Poll `ds_status` and `ds_tail` to monitor progress. The worker runs asynchronously — dispatch returns immediately.

- `ds_status` gives a summary: steps completed, files touched, current status
- `ds_tail` gives raw event log entries for debugging

You can `ds_abort` at any time with a reason. The worker terminates at the next step boundary and returns a partial diff.

### 5. Audit
Read the full diff with `ds_diff`. **Never skip this step.** The worker runs at temperature 0 and cannot modify tests, but it can still produce incorrect code, hardcode values to satisfy assertions, or misunderstand the spec.

### 6. Accept or Reject
- `ds_accept`: Squash-merges the worker branch into your current branch, then removes the worktree and branch. This is irreversible — audit first.
- `ds_reject`: Removes the worktree and branch without merging. Use when the implementation is wrong or the approach needs to change.

---

## Audit Checklist

- [ ] Read the full diff — every line
- [ ] Verify tests pass (`acceptanceExitCode === 0`)
- [ ] Verify no test files were modified (`testsModified` is empty)
- [ ] Check for hardcoded values that satisfy assertions without solving the problem
- [ ] Verify the implementation matches the spec exactly
- [ ] Check for unnecessary changes outside `mayEdit`
- [ ] Run the acceptance command yourself to confirm

---

## When NOT to Delegate

- **Design work**: Architecture decisions, API design, naming conventions
- **Test authorship**: Tests define the contract — Claude must write them
- **Exploratory work**: If you don't know what the solution looks like, you can't write a closed-form spec
- **Tightly coupled changes**: Changes that span many files with complex interdependencies
- **Single-line fixes**: The overhead of dispatch > the work itself

---

## Parallel Dispatch

You can dispatch multiple independent tasks simultaneously with non-overlapping `mayEdit` globs:

```
ds_dispatch: mayEdit=['src/feature-a/**']  → taskId: abc12345
ds_dispatch: mayEdit=['src/feature-b/**']  → taskId: def67890
ds_wait_all: taskIds=['abc12345', 'def67890']
```

If `mayEdit` globs overlap, the second dispatch is rejected with the conflicting taskId and intersecting globs — sequence them instead.

---

## Model Selection

- Default: `deepseek-v4-flash` — fast, cheap, good for routine implementation
- For complex tasks: `deepseek-v4-pro` — stronger reasoning, better tool-call reliability
- Configure with: `ds-orchestra config set model deepseek-v4-pro`
- Thinking mode is OFF by default (required for temperature=0)

---

## Troubleshooting

| Symptom | Likely Cause | Action |
|---|---|---|
| `ds_dispatch` returns overlap error | Active task has intersecting `mayEdit` | Wait for it to complete, or narrow your `mayEdit` |
| Worker status is `violated` | Worker tried to edit tests, run a blocked command, or exceeded budget | Read the tripwire reason in `ds_status`; adjust the spec or `mayEdit` |
| Worker status is `failed` | Acceptance command exited non-zero or tests were modified | Read the diff; the worker may have hardcoded values |
| Worker summary starts with `BLOCKED:` | The spec was ambiguous or the worker couldn't proceed | Clarify the spec and re-dispatch |
| `ds_accept` fails | Task is still running, or the merge conflicts | Wait for completion; resolve conflicts manually |
| Orphaned worktrees after crash | Process restart clears in-memory state | Run `ds-orchestra gc` to clean up |
