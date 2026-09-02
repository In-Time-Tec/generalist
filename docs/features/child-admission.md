# Child admission

Child admission durably creates a direct child Run and immediately returns its handle, never its outcome. The admission identity combines parent, tool call, optional origin, and key so retries recover the same child. `AgentTool.fanOut` uses the existing grouped admission and settlement journal rather than introducing another child representation.

## Usage

```ts
import { Effect } from "effect"
import { ChildAdmission } from "generalist/runtime"

export const admitReviewers = (keys: ReadonlyArray<string>) =>
  ChildAdmission.AgentChildren.use((children) =>
    Effect.forEach(keys, (key) => children.admit({ selection: "reviewer", prompt: `review ${key}`, key }), {
      concurrency: 1,
    }),
  )
```

`makeAgentChildren(store)` supplies `AgentChildren`; the execution supplies `ToolContext`.

## What runs

```text
admitReviewers(["api", "storage"])
└── AgentChildren.admit({ key: "api", ... })
    ├── ToolContext -> parent "run_parent", call "call-1"
    ├── ToolContext -> operation "run:parent:tool:0:typescript"
    ├── listDirect("run_parent")
    │   └── assign ordinal 0 (or recover the key's ordinal)
    ├── invocationIdFor(...) -> encoded admission identity
    └── RunStore.admitSpawn(...)
        ├── new identity -> persist child -> duplicate: false
        └── replayed identity -> existing child -> duplicate: true
```

## Admission identity

```text
RI { parent: "run_parent", call: "call-1", operation:
     "run:parent:tool:0:typescript", ordinal: 0, key: "reviewer" }
                    │ invocationIdFor(); prefix parent
                    ▼
RO "child-admit:run_parent:child-admit:call-1:
    run%3Aparent%3Atool%3A0%3Atypescript#0:reviewer"
```

`admissionOf` decodes tool call, key, and optional origin; `originOf` returns only the origin. Both origin fields travel in the invocation ID already recorded by `ChildLinked` and canonical child-tree events.

## External placement

Cross-partition hosts import placement schemas and implement `ExternalChildStore`.

```text
reserve(placement, digests, optional parent suspension)
└── admitRoot(...) [durable and fenced]
    └── activateRoot() -> rootSettlement() -> acknowledge
```

Exact retries are idempotent; changed immutable placement, root, executable, or settlement facts fail with a typed conflict or mismatch.

## Invariants

- `AdmitReceipt { childRunId, key, duplicate }` is returned only after the durable child exists; it never contains an outcome.
- Blocking `run_child` and `run_child_group` behavior is unchanged; admission is an additional route.
- `listDirect`, `inspect`, `join`, and `cancel` operate only on direct children.
- `join` reads current state and does not await terminal state; callers poll or follow Run events.
- Durable recorded parentage is authoritative; another parent receives `ChildParentageInvalid` even if it knows the child Run ID.
- `AgentChildren` derives parent Run, tool call, and optional operation key from ambient `ToolContext`.
- `ToolContext` remains an Effect requirement; binding a Run while constructing the service could grant authority over another Run's children.
- Caller-supplied parentage, origin, operation key, and ordinal fields cannot override the ambient values used by `AgentChildren`.
- The durable admission identity includes parent Run, tool call, optional operation key and ordinal, and key; a key alone is not globally unique.
- String fields in the invocation ID are percent-encoded; unrelated IDs, and admission IDs without origin, make `originOf` return `undefined`.
- An execution without an operation key admits a child without origin.
- Ordinals are read from the parent's durable direct children, never an in-process counter; this costs one direct-child read per admission.
- Ordinals are scoped independently by parent Run and operation key.
- New ordinals follow admission order and are dense only when recorded predecessors are dense.
- Re-admitting the same key under the same operation preserves its ordinal and does not advance the sequence.
- The next ordinal is greater than every recorded ordinal, so sparse pre-existing ordinals are never reused.
- Rejection before store admission consumes no ordinal.
- Durable ordinal recovery makes replay and host restart reattach to existing children instead of duplicating them.
- Origin in the invocation ID survives replay, restart, and reload without a separate event schema.

## Related

- Source: `packages/generalist/src/runtime/child/admission.ts`, `packages/generalist/src/runtime/child/external/placement.ts`, `packages/generalist/src/runtime/child/external/store.ts`
- Site: `/docs/guides/tools/durable-composite-tools`
- Decisions/tradeoffs: [Admission returns at admission](../decisions/child-admission-returns-at-admission.md)
