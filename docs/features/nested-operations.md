# Nested operations

`NestedOperation.run` turns one boundary crossing inside a composite tool into a host-ordered operation. A durable host journals and replays it; `layerDirect` keeps the same ordering process-locally.

## Usage

```ts
import { Effect, Schema } from "effect"
import { NestedOperation } from "generalist"

interface Written {
  readonly path: string
  readonly patch: string
}

declare const writeToDisk: (path: string, text: string) => Effect.Effect<Written>

const applyPatch = (path: string, text: string) =>
  NestedOperation.run(
    {
      kind: "replace",
      payload: { path },
      replayPolicy: "never",
      success: Schema.Struct({ path: Schema.String, patch: Schema.String }),
      approval: { capability: "workspace-write" },
      render: (value: Written) => ({ _tag: "Diff", path: value.path, patch: value.patch }) as const,
    },
    writeToDisk(path, text),
  )
```

## What runs

```text
applyPatch("/w/a.ts", "next")
└─ NestedOperation.run(kind="replace", ordinal=0)
   ├─ journal "tool:edit#0"
   ├─ Approvals.resolve("workspace-write")
   ├─ mark status=running
   ├─ writeToDisk("/w/a.ts", "next")
   ├─ persist status=succeeded and encoded Written
   └─ emit nestedOperation { ordinal: 0, status: "succeeded",
      render: { _tag: "Diff", path: "/w/a.ts", patch: "..." } }
```

On a retry, a fresh run-attempt executor assigns ordinal `0` again. Matching journaled content returns the decoded `Written` without calling `writeToDisk`.

## Failure paths

```text
matching "tool:edit#0" ──> replay recorded outcome
different kind/payload ──> NestedOperation.Divergence
denied approval ─────────> record failed; NestedOperation.Denied
pending approval ────────> NestedOperation.Suspended ──> host wait
unobserved + "never" ───> status=unknown ──> NestedOperation.Unknown
```

`NestedOperation.catchSuspension` converts only `Suspended` into the tool executor's `{ _tag: "Suspend", token }` outcome. Without an `Approvals` service, the durable host auto-approves.

## Invariants

- Callers provide `kind`, payload, replay policy, optional result codecs, approval, and render declarations; they never provide identity or ordinal.
- `ToolContext.operationKey` identifies the outer operation; hosts assign independent ordinal sequences per outer operation.
- The persisted identity is `<operationKey>#<ordinal>`; host assignment prevents forging, reordering, and collisions.
- The durable record is `running` before the handler crosses the boundary, preserving evidence that a side effect was attempted.
- Canonical `kind` plus payload digest determines a replay match; object key order does not change that digest.
- Replaying a recorded success or failure requires its matching `success` or `failure` codec; an absent or invalid codec produces `Unknown` rather than an unsafe value.
- A duplicate identity with different content fails with `Divergence`, including recorded and requested kinds and digests.
- An unobserved `replayPolicy: "never"` outcome settles as `unknown`; replay does not repeat the effect.
- A denial never runs the handler and is persisted as failure; pending approval suspends, and `waitFor` opens the matching approval wait.
- `layerDirect` auto-approves and keeps ordinals, encoded duplicate outcomes, and divergence checks only for the Layer's lifetime.
- `Render` is either `Artifact` (path, MIME type, byte size, optional dimensions) or `Diff` (path and patch).
- Render comes only from the handler's real success; payload fields named `render` or `nestedOperation` cannot control it, and render does not affect identity.
- Durable hosts emit `ToolContext.Progress` under `nestedOperation` for status transitions; only successful progress may contain render.
- Render over `maxRenderBytes` (64 KiB) is withheld whole as `renderWithheldBytes`; the operation still succeeds.

## Related

- Source: `packages/generalist/src/core/tools/nested-operation.ts`, `packages/generalist/src/runtime/operation/nested-operations.ts`
- Site: `/docs/guides/durable-composite-tools`
