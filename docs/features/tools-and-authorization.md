# Tools and authorization

Effect AI tools and toolkits own parameter, success, and declared-failure schemas. Baton adds execution placement, progress, output spill, and one authorization path without adding another tool format.

- An immutable per-turn registry owns advertisement, lookup, authorization, and dispatch. Name collisions fail before model or tool work.
- Authorization is one linear pass: active-tool membership, `Permissions.evaluate` with remembered `RuleStore` rules overlaid using last-match semantics, then one `Approvals.resolve(Pending)` for either `Ask` or `needsApproval`. `Approved` executes and remembers only an explicit `remember` rule; `Denied` fails; `Pending` suspends once. Permissions, Approvals, and RuleStore are required seams, with allow-all, auto-approve, and owned in-memory defaults for a run.
- `ToolContext` supplies the run session id, scoped abort signal, and progress emission.
- Successful oversized output may spill through `ToolOutputStore`; no store preserves inline output.
- Placement retries apply only to expected infrastructure failures. Domain failures are not retried.
- Tool calls execute sequentially in model order.
