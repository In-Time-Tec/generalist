# Capability-secure tools (unstable)

`generalist/unstable/capability` provides unforgeable, attenuable, revocable, and time-scoped authority for
individual Effect AI tools. Use capabilities when a child should receive a concrete subset of authority, not merely a
rule that its model could ask to reinterpret.

## Usage

```ts
import { Effect, Schema, pipe } from "effect"
import { Tool } from "effect/unstable/ai"
import { Agent } from "generalist"
import { attenuate, grant, requireUntainted, revoke } from "generalist/unstable/capability"

const FileSystemTool = Tool.make("file_system", {
  parameters: Schema.Struct({ path: Schema.String, op: Schema.Literals(["read", "write"]) }),
  success: Schema.String,
})

const Deploy = pipe(
  Tool.make("deploy", {
    parameters: Schema.Struct({ target: Schema.String }),
    success: Schema.String,
  }),
  requireUntainted(["target"]),
)

const program = Effect.gen(function* () {
  const files = yield* grant(FileSystemTool, {
    scope: { paths: ["src/**"], ops: ["read", "write"] },
    expires: "1 hour",
  })
  const authReads = attenuate(files, {
    paths: ["src/auth/**"],
    ops: ["read"],
  })

  const reviewer = Agent.child(Reviewer, { diff }, { inherit: { tools: [authReads] } })
  yield* revoke(files)
  return reviewer
})
```

`grant(tool, { scope, expires })` returns an Effect containing `Handle<typeof tool>`. `attenuate(handle, scope)` is
synchronous: it either returns another `Handle` for the same tool or throws `AttenuationWidened`/`Invalid` while the
child is being constructed. `check(handle, args)` and `revoke(handle)` are Effects. Journal writes can also expose the
existing typed driver failures. `Agent.child` receives handles, not permission rules or capability IDs.

The public Schemas are:

- `CapabilityId`: a branded non-empty framework-issued identity.
- `Scope`: a non-empty record of non-empty dimension names to non-empty string-pattern arrays.
- `Source`: `{ capabilityId, tool, toolCallId }`, identifying one protected result in a `taint` label.
- `Invalid`, `AttenuationWidened`, and `Denied`: actionable tagged error Schemas.

## Handles and scope

A live handle and its scope are frozen process-local values registered in a private `WeakMap` for one exact `Tool`
object. Its visible branded ID is not enough to exercise authority: copying its fields, reconstructing an object,
reusing it with a different same-named `Tool`, or passing a plain string fails as `Invalid`.
Durable child admission serializes only a framework-created descriptor. Recovery accepts that descriptor only from the
Schema-validated child journal boundary and verifies its complete grant/attenuation lineage before attaching it.

Each scope dimension maps to model argument values. Plural scope names also match their singular argument name, so
`paths` constrains `path` and `ops` constrains `op`; a same-named string array is also accepted. Every constrained
argument value must match one pattern. `*` is the wildcard at use time.

Attenuation must retain every parent dimension and may add dimensions. Construction proves containment for exact
patterns and parent suffix wildcards: for example, `src/**` may become `src/auth/**` or `src/auth/token.ts`. A candidate
that depends on a more complex wildcard implication is rejected rather than guessed to be narrower. Attenuation never
extends the parent's expiry.

Revoking a handle marks that handle and every process-local descendant. A new use checks every ID in the handle's
lineage, so a journaled ancestor revocation also denies descendants after recovery. Revocation affects new authorization
attempts; it does not cancel a tool already dispatched.

## Authorization order and denials

For an active tool name, the loop runs these boundaries in order:

```text
model tool call
└── Capability.check
    ├── lineage revocation
    ├── expiry
    ├── scope
    └── required-untainted arguments
        └── Hooks.onToolCall
            └── Permissions and Approvals
                └── tool dispatch
```

A capability denial skips hooks, permissions, approvals, and dispatch. It becomes a
`generalist/capability/Denied` tool failure in the completed batch, so the model sees the typed reason (`expired`,
`invalid-scope`, `missing`, `revoked`, or `tainted`) on its next turn. Calls without attached handles retain the ordinary
Permissions behavior unless their tool declares `requireUntainted`.

Capabilities and Permissions are complementary:

- Use a capability to give a child one concrete, scoped, expiring piece of authority that it cannot widen.
- Use Permissions for coarse tool-name policy, remembered allow/ask/deny decisions, and tools without resource scopes.
- A capability allow does not bypass Permissions. Both layers must allow the call.

## Taint propagation

Every framework tool result carries `taint: ReadonlyArray<Source>`; an untainted result carries `[]`. An allowed
capability use adds its own `Source`, and its result also retains the taint snapshot on the arguments that led to that
call. Replayed results retain the persisted labels.

Structural provenance from issue #354 is not available yet. The current rule is deliberately conservative:

1. Before a model-authored tool-call batch starts, the loop snapshots every taint source accumulated from results in
   the model's current context.
2. Every argument in that batch is treated as tainted by the whole snapshot. Sibling results do not affect calls
   authored in the same batch.
3. A tool declaring `requireUntainted([...])` is denied when that snapshot is non-empty.
4. A committed compaction that replaces model context journals `TaintCleared` and resets the accumulator.

This rule lives in one `taintForArguments` function so #354 can replace it with per-value structural provenance without
changing the capability or result contracts.

## Journal and replay

Capability state is part of `LoopDriverState` in the existing Run checkpoint. There is no capability store or second
journal. The checkpoint contains the authority lineage, idempotent use decisions, revocations, taint labels, and
compaction clears. A child writes the complete grant and attenuation lineage when the handles enter its Run.

A use is keyed by `(turn, capability ID or unscoped, tool-call ID, tool)`. Recovery reuses that exact recorded allow or
deny decision before any current-clock or scope check; the model is never asked to reconstruct capability state. Tool
operation replay reapplies its persisted result and taint without redispatch.

The unstable revocation boundary is currently process and journal scoped. A live revoke reaches descendants in the
same process, and a revocation already present in a Run journal survives recovery. It is not broadcast to an
already-running descendant hosted in another process. Give cross-process children short expiries until a Runtime-owned
ancestor-journal lookup or revocation channel is added.

## Related

- Source: `packages/generalist/src/unstable/capability/`, `packages/generalist/src/core/capability/`,
  `packages/generalist/src/core/agent/tools/authorization.ts`, `packages/generalist/src/core/durable/loop-driver-state.ts`
- Sibling feature docs: [`tools-and-authorization.md`](./tools-and-authorization.md),
  [`multi-agent.md`](./multi-agent.md), [`hooks.md`](./hooks.md), [`session-and-compaction.md`](./session-and-compaction.md)
