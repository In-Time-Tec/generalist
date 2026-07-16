# Tools and authorization

Effect AI tools and toolkits own parameter, success, and declared-failure schemas. Baton adds execution placement, progress, output spill, and one authorization path without adding another tool format.

- An immutable per-turn registry owns advertisement, lookup, authorization, and dispatch. Name collisions fail before model or tool work.
- Authorization checks active-tool membership, current and remembered permissions, then `needsApproval`. Deny wins over allow; required approval fails closed when no answer source exists.
- `ToolContext` supplies the run session id, scoped abort signal, and progress emission.
- Successful oversized output may spill through `ToolOutputStore`; no store preserves inline output.
- Placement retries apply only to expected infrastructure failures. Domain failures are not retried.
- Tool calls execute sequentially in model order.
