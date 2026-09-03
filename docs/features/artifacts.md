# Shared artifacts (unstable)

`generalist/unstable/artifact` lets a human and an Agent edit one shared text document as CRDT peers. Model edits stay ordinary `effect/unstable/ai` tools. Host and Server clients use the same versioned operation log and retain the author of every edit.

Artifacts are for shared plans, specifications, canvases, and similar application state. They do not replace sandbox files.

## Open a document

```ts
import { Toolkit } from "effect/unstable/ai"
import { Agent } from "generalist"
import { Artifact, Yjs } from "generalist/unstable/artifact"

const document =
  yield *
  Artifact.open("plan.md", {
    crdt: Yjs.layer(),
    initial: "Draft plan",
  })

const writer = Agent.make({
  name: "writer",
  toolkit: Toolkit.make(Artifact.readTool(document), Artifact.tool(document)),
})
```

`Artifact.open` requires the Artifact registry Layer exported as `layer`, a `RunStore`, a `BlobStore`, and a `Scope`. The Yjs implementation is optional: applications that import this unstable leaf install the optional `yjs` peer and pass `Yjs.layer()`. `ArtifactCrdt` is the CRDT service boundary for other implementations.

Opening a name creates version 0 if the runtime store has no main head. Reopening durable storage uses its existing CRDT and snapshot; `initial` is only used on first creation. One process registry cannot open the same name twice.

## Model reads and edits

`Artifact.readTool(document)` returns:

```ts
{
  artifact: string
  version: number
  content: string
  branch?: string
}
```

The successful tool completion journals the exact `{ artifact, version, branch? }` observed by the model and records that position in the Run checkpoint. `Artifact.read(document)` is the host-side direct read and does not create a Run journal entry.

`Artifact.tool(document)` accepts one range operation against that exact version:

```ts
{
  base: number
  operation:
    | { _tag: "Insert"; at: number; text: string }
    | { _tag: "Delete"; from: number; to: number }
    | { _tag: "Replace"; from: number; to: number; text: string }
}
```

Its successful journal result is `{ artifact, base, result, attribution, branch? }`. Agent attribution contains `_tag: "Agent"`, the Agent name as `actor`, and `runId`.

A model must submit the version in its latest successful read checkpoint. Any other `base` returns `ArtifactBaseStale` through the tool's typed failure channel and does not edit the document. If a human advances the same branch after that read, the submitted base is still honest: Yjs maps the base-relative range into the current document and merges it when the base is an ancestor. Invalid ranges and incompatible CRDT ancestry fail rather than silently changing coordinates.

## Human peers and update streams

An open document appears on its Host:

```ts
const current = yield * host.artifacts.read("plan.md")

yield *
  host.artifacts.edit("plan.md", {
    base: current.version,
    operation: { _tag: "Insert", at: current.content.length, text: "\nHuman note" },
    attribution: { _tag: "Human", actor: "alice" },
  })

const updates = yield * host.artifacts.subscribe("plan.md", current.version)
```

The optional subscription version is exclusive and defaults to 0. Every `ArtifactUpdate` carries `artifact`, `base`, `result`, the range `operation`, `attribution`, CRDT `update` bytes, the complete snapshot `Media.Ref`, and optional `branch`. Replay is ordered by `result`, followed by live updates without a subscribe/replay gap. Producers never wait for slow consumers; a bounded subscriber fails with `ArtifactSubscriberLagged` and reconnects from its last delivered version.

The Server exposes the same open documents:

- `GET /artifacts/:name` returns the current `ReadResult`.
- `GET /artifacts/:name/ws?version=<exclusive-version>` upgrades to WebSocket. The server first sends `{ _tag: "Snapshot", document }`, then `{ _tag: "Update", update, document }` events.
- A browser sends `{ _tag: "Edit", base, operation, attribution: { _tag: "Human", actor } }` over that socket.

The exported `Server.ArtifactClientCommand` and `Server.ArtifactServerEvent` Schemas own this JSON boundary. Authentication is inherited from the enclosing Server Layer.

## Persistence, replay, and fork

The runtime driver's artifact head and operation log are authoritative for ordering. Each compare-and-append stores the base-relative range, result version, attribution, CRDT update, and snapshot reference. `BlobStore` stores complete binary CRDT snapshots as `Media.Ref`; Run events never contain binary CRDT state.

An edit that loses the compare-and-append race reloads the head and retries the same base-relative CRDT merge up to eight times. Continued contention returns the typed `ArtifactVersionConflict` instead of retrying without a bound.

Replaying operation-log updates from a referenced snapshot reproduces the current document. Reopening with a fresh runtime and BlobStore Layer restores both the current snapshot and replay stream.

Runtime fork and rewind copy the Run checkpoint's last observed artifact position. The first Agent read or edit in the new Run lazily creates a private artifact branch named by the forked Run ID at that position. Main-branch edits made after the copied checkpoint are not included, and branch edits do not alter main.

A successful Agent edit also projects as the `ArtifactUpdated` Host event at the tool completion's existing Session cursor. Human edits are observed on `host.artifacts.subscribe`; they do not create synthetic Run or Session journal events.

## Current boundary

Artifact registration is process-scoped even when storage is durable, so each serving process opens the names it hosts. SQL subscriptions durably replay updates on connection and receive live writes made through that process. PostgreSQL/MySQL artifact writes from another process are visible after reconnect, but do not currently wake an already-open artifact stream in this unstable release.

## Related

- Example: `examples/co-edit`
- Source: `packages/generalist/src/unstable/artifact/`, `packages/generalist/src/core/artifact.ts`
- Tests: `packages/generalist/test/artifact/`
- Sibling features: [`fork.md`](./fork.md), [`host.md`](./host.md), [`media.md`](./media.md), [`server.md`](./server.md), [`tasks.md`](./tasks.md)
