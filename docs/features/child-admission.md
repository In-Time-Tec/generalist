# Child admission

Child admission durably creates a direct child Run and immediately returns its handle, never its outcome. The admission identity combines parent, tool call, optional origin, and key so retries recover the same child. `AgentTool.fanOut` uses the existing grouped admission and settlement journal rather than introducing another child representation.

## Named profiles

Declare permitted children on the Agent instead of installing a blocking tool to grant delegation. `Host.make` resolves names against its Agent registry before registration. Unknown or duplicate profile names fail with `ExecutableRegistrationInvalid`. The declaration is copied at construction, so mutating the caller's array cannot change a compiled profile.

This composition fragment defines profiles and limits; it does not call a model or provision storage. Creating the Host requires the Runtime, model, permissions, and approval Layers described in [Runtime](./runtime.md).

```ts
import { Effect } from "effect"
import { Agent } from "generalist"
import { Host } from "generalist/host"

const researcher = Agent.make({ name: "researcher", children: ["researcher"] })

const hosted = Effect.gen(function* () {
  return yield* Host.make({
    agents: { researcher },
    revision: "researcher-build",
    limits: {
      tree: { maxDepth: 3, maxSessions: 32 },
      concurrency: { agents: 4, tools: 8 },
    },
  })
})
```

Profile references are pinned in the executable manifest. Self-reference and mutual recursion use names, not JavaScript object cycles; each admission still checks the parent's declared selections and pinned depth bound. Registering a profile does not let every other Agent delegate to it. Direct and grouped profile resolution rejects child tool names absent from the parent. Program child admission also requires the requested executable entries and profile bindings to remain within the parent's pinned closure.

## Retained child conversations

`HostRun.spawn(selection, prompt, { commandId, label? })` returns `{ session, run }` after admission, before execution completes. The child Session and initial Run are committed together. Reuse the same command ID and immutable input after an ambiguous response; `host.runs.get(parentRunId)` recovers a parent handle on a fresh Host, and an exact retry returns the same child Session and Run. Changed input under that command ID fails with `IdempotencyConflict`.

`session.inspect` and Run inspections expose `retainedSession`: the Session identity, original parent Run and Session, root Session, initial Run, and depth. These fields are projected from canonical Session family records rather than maintained in another registry. The child Session also retains its pinned executable selection. A completed Run remains terminal; follow-ups use `session.message`, not terminal Run steering.

`session.message(prompt, { commandId })` derives its sender from the authenticated `SessionSender` Runtime service. Applications supply that service after authenticating a principal and authorizing the target Session; the message options cannot supply a display name or override the sender. A Run sender must belong to the retained family. The sender is retained in the inbox or queued input and in the model-facing message framing.

An active Run receives the message through its durable steering inbox, after tool results and before the next model turn. Admission and completion serialize: a message accepted before completion continues that Run at its safe boundary; a message accepted after completion queues a fresh Run. Exact retries return the original command receipt across either outcome and across fresh Hosts.

An idle child Session uses its current `sponsorRunId` to request ordinary child admission with the pinned selection. The sponsor must still be live and have an available grant. A message from a new Run in the original parent Session can replace the current sponsor; this does not rewrite `retainedSession.parentRunId`, the original family, or incurred spending. Follow-up allocations are capped by both the sponsor's remaining allocation and the retained Session grant minus canonical spending across its Runs. Unknown dollar spending exhausts a bounded dollar allocation rather than treating it as free.

Messages to stopped Sessions, or idle Sessions without an executable allocation, remain in the bounded queue without a new Run. `session.stop({ commandId })` fences automatic promotion and normal execution claims before requesting cancellation of the Session's Runs and their Run descendants. `session.resume({ commandId })` explicitly reopens promotion; it does not mint a grant or revive a terminal Run. `session.close({ commandId })` is permanent: later messages remain retained but resumption fails. All three lifecycle commands have immutable retry receipts.

Run cancellation affects that Run and its execution descendants, not the retained Session's future admission policy. Session stop adds that policy fence. Parent success, observer disconnect, wait timeout, and host sleep are not Session stop or implicit cancellation. Local execution fibers are interrupted after the durable cancellation decision; replacement hosts observe the same decision before executing work. Pending cleanup may outlive the stop acknowledgement.

`host.sessions.family(sessionId, { limit: 64 })` returns a bounded page of compact retained Session metadata. The first page pins `at` to the root Session's current event cursor. Continue with `{ at, before: nextBefore, limit: 64 }` until `nextBefore` is `null`, including when a page is empty. Each call scans at most 256 root Session events and returns at most 64 members, so families larger than a page remain inspectable. Membership comes from each Session's first admitted Run, not another family registry; later admissions cannot enter an older cursor-pinned traversal. Pages are chronological within each backward scan. Load a Session by its `id` to inspect its pinned executable selection.

The Host is a trusted interface to its configured Runtime namespace; an application must authorize the requested Session before exposing family reads to a remote user. Inside an execution, `AgentChildren.listDirect`, `inspect`, and `join` expose retained Session metadata only for children belonging to the ambient parent Run; another parent cannot adopt a child by knowing its ID.

Child Session snapshots return recent Run summaries and a bounded conversation tail; use the Session history and Run pages to load older retained evidence. Child lifecycle events have their own Session replay cursor and remain visible in the original root Session's stream. A snapshot cursor is exclusive: resume after it to avoid redispatching historical execution.

## Family admission limits

The root-pinned policy contains `maxDepth`, `maxSessions`, and separate `concurrency.agents` and `concurrency.tools` fields. Root depth is zero. Direct, grouped, and Program child admission reserve distinct retained Session IDs within the canonical Session family. The existing RuntimeSession records fixed parent/root Session identities, depth, policy, and spending grant; retained Run and child-Session references support family traversal. Settling or cancelling a child does not refund its retained Session reservation, and a queued root continuation does not start a new family. Retrying an accepted admission does not reserve another Session, and a rejected group leaves no partial children.

Agent readiness is shared across the family rather than counted separately for each parent. Execution claims check live Agent ownership. A suspended parent releases its live slot, allowing a descendant to run when Agent concurrency is one. Tool-Run classification and Tool-capacity enforcement require the Tool-Run admission contract; the presence of `concurrency.tools` alone does not enforce Tool execution capacity.

Explicit Host limits install one canonical namespace policy before any Run is admitted. Fresh Hosts may reinstall the same policy, but cannot replace it. Raw Runtime/store admissions and serialized server start/queue routes enforce that policy; Session selections and queue edits may narrow it, never widen it. Omitting limits inherits the admitted ceiling rather than substituting a larger default.

Child spending allocations are capped by the parent's remaining grant, the selected profile's budget, and any retained Session grant. A root request that exceeds its admitted Session or profile budget is rejected. Submitting a new root directly into a child Session is also rejected: continuing that child requires a fresh parent-owned admission, so a continuation cannot reuse an allocation whose unused allowance was already returned to its ancestor.

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
- Tests: `packages/generalist/test/runtime/executable/registered-agent.test.ts`, `packages/generalist/test/runtime/child/admission.test.ts`, `packages/generalist/test/host/index.test.ts`
- Site: `/docs/guides/tools/durable-composite-tools`
- Decisions/tradeoffs: [Admission returns at admission](../decisions/child-admission-returns-at-admission.md)
