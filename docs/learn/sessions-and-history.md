---
title: "Sessions, history, and persistence"
description: "The append-only session entry log, Effect AI prompt projection, and the two ways a run can carry history."
---

Generalist separates two ideas that most frameworks fuse: the record of a conversation, and the context a model sees. The record is an append-only log; the context is a pure function of a path through it. This page explains the `Session` seam and the two ways a run can carry history at all.

## An append-only log with a leaf pointer

A session is a log of entries plus a mutable current-leaf pointer. The entry union is closed and prompt-native: `Message` stores one `Ai.Prompt.Message` verbatim; `ToolCall` and `ToolResult` store Effect AI tool-call and result parts without inventing another wire shape; `Memory`, `Skill`, `Steering`, and `Handoff` record the context seams robust agents need; `Compaction` stores the exact projected history used by live Chat; `BranchSummary` stores a digest of an abandoned branch. Each entry has an id and a `parentId`, so the log is a tree. Nothing is ever rewritten or deleted: branching means moving the leaf pointer and appending a new child. An exact `Session.Service` acquired from `SessionDirectory` exposes `append`, `appendCheckpoint`, `path`, `setLeaf`, `leaf`.

## Context is a projection, not a copy

The prompt the model sees is never stored separately. `Session.buildContext(path)` purely projects a root-to-leaf path into an `Ai.Prompt.Prompt`: prompt-native entries keep their roles and parts, context notes become tagged system messages, and the last compaction on the path wins. A compaction is a self-contained checkpoint: its stored projection is used directly and projection never reads entries before it. Compaction is lossless in the log and lossy only in the projection:

**projection.ts**

```typescript
import { Console, Effect, ManagedRuntime } from "effect"
import { Session } from "generalist"
import { Prompt } from "effect/unstable/ai"

const message = (entry: Prompt.Message): Session.AppendInput => ({ _tag: "Message", message: entry })

const user = (text: string): Prompt.Message =>
  Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text })] })

const assistant = (text: string): Prompt.Message =>
  Prompt.makeMessage("assistant", { content: [Prompt.makePart("text", { text })] })

const program = Effect.scoped(
  Effect.gen(function* () {
    const store = yield* Session.acquire("travel-planner")
    yield* store.append(message(Prompt.makeMessage("system", { content: "You are a travel planner." })))
    yield* store.append(message(user("Plan a trip to Boise.")))
    yield* store.append(message(assistant("Three days in Boise, starting downtown.")))
    const kept = yield* store.append(message(user("Add a rafting day.")))
    const checkpointId = yield* store.reserveEntryId

    const before = Session.buildContext(yield* store.path())
    yield* Console.log(`before: ${before.content.map((entry) => entry.role).join(" ")}`)

    yield* store.appendCheckpoint({
      id: checkpointId,
      parentId: kept.id,
      projectedHistory: Prompt.fromMessages([user("Planned a three-day Boise trip. Add a rafting day.")]),
      telemetry: [],
      summary: "Planned a three-day Boise trip.",
    })

    const path = yield* store.path()
    const after = Session.buildContext(path)
    yield* Console.log(`after: ${after.content.map((entry) => entry.role).join(" ")}`)
    yield* Console.log(`log entries: ${path.length}`)
  }),
)

const runtime = ManagedRuntime.make(Session.layerMemory)
await runtime.runPromise(program)
```

**Output**

```text
before: system user assistant user
after: user
log entries: 5
```

After the compaction entry the projected context shrinks to a checkpoint plus the kept tail, while the log still holds all five entries. Rewinding is moving the leaf; auditing is reading the log; shrinking context is appending an entry. [How to stay inside the context window](/guides/compaction) covers the strategy that decides when Generalist appends one for you.

## Two ways a run carries history

A run can be given its past in two ways, each fitting a different owner:

| Run option                       | Mechanism                                                                                                       | Use it when                                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `history`                        | The prior transcript is used verbatim as the initial chat, no system message prepended                          | The host already owns transcript storage: resuming after suspension, replaying an exported transcript |
| `sessionId` + `SessionDirectory` | The keyed structured entry log above; an explicit sessionId acquires one exact store for the complete run scope | You need branchable, auditable history with compaction checkpoints recorded as entries                |

`history` is a process-local seed. `sessionId` selects the authoritative Session when a SessionDirectory is present. The full `RunOptions` field table lives in [Agent and run functions](/reference/core-agent), and the session contract in [Context seams](/reference/core-context).

## Where durable history lives

The generalist layers on this page are non-durable by design: `Session.layerMemory` is an application-scoped keyed directory of independent Ref-backed stores. Omitting `sessionId` leaves a run ephemeral even when the directory is present. For durable, addressable execution, generalist/runtime stores the Session and canonical RunEvent stream and reconstructs the core driver across attempts. Application conversation storage can implement `Session.Directory` over its own database. The core/runtime split is covered in [Core and Runtime: where durability lives](/learn/native-runtime).
