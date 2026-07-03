# Approvals, HITL, and Permissions

`Approvals` enforces `Ai.Tool.needsApproval`. `Approved` executes the call, `Denied` returns a failed tool result to the model, and `Pending` suspends with `AgentSuspended { reason: "approval" }`.

`Permissions` runs before approvals. It evaluates host policy as allow, deny, or ask. Allow continues into the normal approval path; deny becomes a failed tool result; ask uses the same approval suspension contract. There is one wait vocabulary and one resume path.

Runnable workflow: [`../../../examples/hitl-over-sse/README.md`](../../../examples/hitl-over-sse/README.md).
