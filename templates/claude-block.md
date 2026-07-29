<!-- This block is managed by ds-orchestra. Do not edit manually. -->

## Task Routing

**Before writing any implementation code, check this table:**

| Task type | Action | Tool |
|---|---|---|
| Implement a feature against existing tests | **DELEGATE** — do not implement yourself | `ds_dispatch` |
| Fill in function bodies to pass tests | **DELEGATE** — the worker does this | `ds_dispatch` |
| Generate boilerplate, scaffolds, migrations | **DELEGATE** — mechanical work | `ds_dispatch` |
| Refactor across files with clear spec | **DELEGATE** — give the worker a spec | `ds_dispatch` |
| Fix a bug with a failing test already written | **DELEGATE** — worker fixes to pass test | `ds_dispatch` |

If the task matches any row above: write the tests, then call `ds_dispatch`. Do NOT read source files or start implementing. The worker does the implementation.

**Only implement yourself if:** designing architecture, writing tests, exploratory investigation, single-line fix, or the spec is unclear.

Full guide: `ds-orchestra/INSTRUCTIONS.md`
