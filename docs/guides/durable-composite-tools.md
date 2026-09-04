---
title: "How to build a durable composite tool"
description: "Journal each boundary a composite tool crosses, spawn children that return at admission, and page the exact entry log a compaction rewrote."
---

A composite tool call — a cell, an agent program step — is not one boundary crossing. It writes files, spawns children, and calls out, and a crash can land between any two of them. Generalist journals each crossing under the outer operation's identity so the run recovers without repeating side effects.

## 1. Journal each crossing

`NestedOperation.run(request, effect)` records one crossing before the handler runs. Identity is derived, never supplied: the ambient `ToolContext` names the outer operation and the host assigns the ordinal, so tool or cell code cannot forge, reorder, or collide with another call's journal. The persisted key is `<operationKey>#<ordinal>`.

**journal-a-crossing.ts**

```typescript
import { Effect, Schema } from "effect"
import { NestedOperation, ToolContext, ToolExecutor, ToolPlacement } from "generalist"

interface Written {
  readonly path: string
  readonly patch: string
}

class WriteFailed extends Schema.TaggedError<WriteFailed>()("generalist/docs/WriteFailed", {
  path: Schema.String,
}) {}

declare const writeToDisk: (path: string, text: string) => Effect.Effect<Written, WriteFailed>

type InExecution = NestedOperation.Operations | ToolContext.ToolContext

/**
 * One boundary crossing inside a composite tool call. Identity is derived from the ambient
 * ToolContext plus a host-assigned ordinal, so the handler cannot choose or collide with it.
 *
 * `render` is applied to the handler's real outcome, never read from `payload`, so input that
 * plants a `render` field cannot dictate what the host displays.
 */
export const applyPatch = (input: {
  readonly path: string
  readonly text: string
}): Effect.Effect<Written, WriteFailed | NestedOperation.Failure, InExecution> =>
  NestedOperation.run(
    {
      kind: "replace",
      payload: { path: input.path },
      replayPolicy: "never",
      approval: { capability: "workspace-write" },
      render: (value: Written) => ({ _tag: "Diff" as const, path: value.path, patch: value.patch }),
    },
    writeToDisk(input.path, input.text),
  )

const returned = (tag: string, detail: string): Effect.Effect<ToolExecutor.Outcome> =>
  Effect.succeed({
    _tag: "DomainFailure",
    failure: { _tag: tag, detail },
    encodedFailure: { _tag: tag, detail },
  })

/**
 * A crossing whose approval the host cannot settle in process fails NestedOperation.Suspended.
 * `catchSuspension` converts exactly that error into the executor's Suspend outcome; every other
 * failure is mapped first, so the suspension is still on the error channel when it reaches it.
 */
export const route: ToolPlacement.Route<InExecution> = ToolExecutor.route<InExecution>({
  tools: ["edit_file"],
  execute: (request) =>
    NestedOperation.catchSuspension(
      applyPatch({ path: request.call.id, text: "next" }).pipe(
        Effect.map(
          (written): ToolExecutor.Outcome => ({
            _tag: "Success",
            result: written,
            encodedResult: { path: written.path, patch: written.patch },
          }),
        ),
        Effect.catchTag("generalist/docs/WriteFailed", (failure) =>
          Effect.succeed<ToolExecutor.Outcome>({
            _tag: "DomainFailure",
            failure,
            encodedFailure: { _tag: failure._tag, path: failure.path },
          }),
        ),
        // Divergence, an unobserved outcome, and a denial are decisions the model should read, so
        // they come back as schema-valid failed tool results rather than failing the run.
        Effect.catchTags({
          "generalist/core/NestedOperationDenied": (failure) => returned(failure._tag, failure.reason),
          "generalist/core/NestedOperationDivergence": (failure) =>
            returned(failure._tag, `recorded ${failure.recordedKind}, requested ${failure.requestedKind}`),
          "generalist/core/NestedOperationUnknown": (failure) => returned(failure._tag, failure.operationId),
        }),
      ),
    ),
})
```

| Situation                                                    | Outcome                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| The same identity is seen again with the same content        | The recorded outcome is returned; the effect does not run again                                  |
| The same identity is seen again with different content       | `NestedOperation.Divergence` carrying the recorded and requested kind and digest                 |
| The outcome was never observed under `replayPolicy: "never"` | `NestedOperation.Unknown`, for explicit resolution rather than a silent repeat                   |
| The host denies the declared approval                        | `NestedOperation.Denied`, recorded as a failed operation                                         |
| The host cannot settle the approval in process               | `NestedOperation.Suspended`, which `catchSuspension` turns into the executor's `Suspend` outcome |

Hosts with no durable storage use `NestedOperation.layerDirect`: identity, duplicate return, and divergence hold for the life of the run, and approvals auto-approve because a process-local host owns no resolution seam.

## 2. Project the outcome for the host

`Render` is a host-side projection of one crossing's own outcome: the closed union of `Artifact` (path, mime type, byte size, optional dimensions) and `Diff` (path, patch). One progress record per status transition carries it under the `nestedOperation` data key.

- The value comes from the handler's `render` function applied to the real result, never from the request payload, so input that plants a `render` field cannot dictate what the host displays.
- `running` carries no projection because there is no outcome yet, and a failed crossing carries none either.
- A projection over `NestedOperation.maxRenderBytes` (64 KiB) is withheld whole and reported as `renderWithheldBytes` while the operation still succeeds: a partial diff would render as a smaller correct change rather than as a missing one.

## 3. Spawn children without blocking

`ChildAdmission.admit` returns as soon as the durable child Run exists. It never carries an outcome — admission answers "which durable child owns this work", not "what did it produce" — so a crash between spawn and answer never loses the child.

**admit-and-join.ts**

```typescript
import { Effect } from "effect"
import { ToolContext } from "generalist"
import { ChildAdmission } from "generalist/runtime"

type InExecution = ChildAdmission.AgentChildren | ToolContext.ToolContext

/**
 * Admission returns a handle, not an answer. Parentage, tool call, and operation key come from the
 * ambient ToolContext, so a caller names only the work.
 */
export const admitReviewers = (
  keys: ReadonlyArray<string>,
): Effect.Effect<
  ReadonlyArray<ChildAdmission.AdmitReceipt>,
  ChildAdmission.AdmitChildError | ChildAdmission.ChildParentageInvalid,
  InExecution
> =>
  ChildAdmission.AgentChildren.use((children) =>
    Effect.forEach(keys, (key) => children.admit({ selection: "reviewer", prompt: `review ${key}`, key }), {
      concurrency: 1,
    }),
  )

/**
 * `join` reads the child's current state; it does not block until the child is terminal. A caller
 * that must wait polls this or follows Run events.
 */
export const settledChildren: Effect.Effect<
  ReadonlyArray<ChildAdmission.ChildInspection>,
  ChildAdmission.ChildLookupError,
  InExecution
> = ChildAdmission.AgentChildren.use((children) =>
  Effect.map(children.listDirect, (all) =>
    all.filter((child) => child.status === "succeeded" || child.status === "failed"),
  ),
)

/**
 * Origin groups children under the cell that produced them, in source order. It survives replay and
 * restart because it travels inside the invocation id that ChildLinked already carries.
 */
export const byCell = (
  children: ReadonlyArray<ChildAdmission.ChildInspection>,
): ReadonlyMap<string, ReadonlyArray<ChildAdmission.ChildInspection>> => {
  const grouped = new Map<string, Array<ChildAdmission.ChildInspection>>()
  for (const child of children) {
    if (child.origin === undefined) continue
    const bucket = grouped.get(child.origin.operationKey) ?? []
    bucket.push(child)
    grouped.set(child.origin.operationKey, bucket)
  }
  return new Map(
    [...grouped].map(([operationKey, bucket]) => [
      operationKey,
      bucket.toSorted((left, right) => (left.origin?.ordinal ?? 0) - (right.origin?.ordinal ?? 0)),
    ]),
  )
}
```

<Warning title="join does not block">
join reads the child's current state. A caller that must wait polls it or follows Run events. The blocking run_child path and the child-group operations are unchanged; this is an additional route, not a replacement.
</Warning>

Parentage is read from the durable child record, so knowing a child Run id grants nothing to a Run that did not admit it: a mismatched parent fails `ChildParentageInvalid`. `ToolContext` stays in the signature deliberately — binding one Run into the service at Layer creation would let a caller admit and cancel children under another Run.

## 4. Group children by the cell that produced them

A cell admits many children in one tool call, so the tool call alone does not say which statement produced which child, nor in what order. `ChildOrigin { operationKey, ordinal }` names the operation that ran the code and a host-assigned ordinal within it. It travels inside the invocation id, which `ChildLinked` already carries, so correlation survives replay, restart, and reload with no event-schema change.

The ordinal is derived from the parent's own durable children rather than an in-process counter. That makes it unforgeable — an origin supplied in the caller's payload is ignored — and stable across restart: the ordinal derives the idempotency key, so a counter that restarted at zero would mint a second invocation id for the same logical spawn and silently duplicate a child Run. A re-admitted key keeps its original ordinal; only a genuinely new key extends the sequence.

## 5. Page the exact log a compaction rewrote

`SessionHistory.page` is pure and reads the entry log, not the model projection. That distinction is the point: compaction drops pre-checkpoint entries from what the model sees, but they remain in the log and remain pageable.

**Paging behind a checkpoint**

```typescript
import { SessionHistory } from "generalist"

// The newest page, then walk backwards until the log runs out.
let page = SessionHistory.page(path, { limit: 50 })
while (page.hasBefore) {
  page = SessionHistory.page(path, { limit: 50, before: page.firstEntryId })
}

// Paging reads the entry log, not the projection, so entries a compaction dropped from the model's
// context are still here. A checkpoint is an ordinary entry in the page, never a floor.
const checkpoints = SessionHistory.compactionCheckpoints(path)
```

With no cursor it reads the newest page; `before` reads strictly older entries and `after` strictly newer ones. `hasBefore` is how a caller learns that history continues behind a checkpoint rather than ending there, and `compactionCheckpoints` lists exactly the points where the projection was rewritten. See [Sessions and history](/learn/sessions-and-history) for the log the page reads and [How to compact a session](/guides/compaction) for what rewrote it.
