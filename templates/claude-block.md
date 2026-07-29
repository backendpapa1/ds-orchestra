<!-- This block is managed by ds-orchestra. Do not edit manually. -->
<!-- Local overrides go in CLAUDE.md OUTSIDE this block. -->

## Delegation (ds-orchestra)

**When to delegate**: Bulk/mechanical implementation above ~200 lines with a clear acceptance command (compile + tests pass). Refactoring, boilerplate, data migrations, implementation against existing tests.

**Before dispatching**:
- Write the tests yourself in `tests/`. The worker CANNOT edit tests.
- `goal` must be a closed-form spec: exact signatures, exact behavior, edge cases.
- `mayEdit` must be as narrow as possible (e.g., `src/feature-a/**`).

**Decide before reading source files**. Use Glob/Grep/LS only until you commit to delegate. If you cannot scope the task without reading every file, implement it yourself.

**After the run**:
- Read the full diff with `ds_diff` before `ds_accept`. Never merge unaudited.
- If the worker failed because tests were wrong, fix the tests (you wrote them) and re-dispatch.

Full workflow and audit checklist: `ds-orchestra/INSTRUCTIONS.md`
