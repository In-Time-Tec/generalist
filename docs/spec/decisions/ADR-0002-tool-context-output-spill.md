# ADR-0002 — Tool Context and Output Spill

## Status

Accepted.

## Context

Real tool handlers need ambient execution context: cancellation for long-running work, progress reporting while work is in flight, and an opaque run/session identity. Passing these as ad-hoc callback arguments through every host executor would make Baton harder to compose with Effect services and durable hosts.

Large tool outputs also consume model context quickly. Baton needs a small non-durable core seam that lets hosts store overflow elsewhere while the loop continues to feed bounded `Ai.Response` tool-result parts to the next model turn.

## Decision

Add `ToolContext` as a per-tool-call service. The Baton loop provides a fresh context around each framework-executed `ToolExecutor.execute` call. The context contains an `AbortSignal`, a `sessionId`, and `emit(progress)`. Progress updates become `ToolProgress` loop events and are observational only; they are never added to pending tool results.

Progress updates cross a per-tool bounded Effect `Queue`. `RunOptions.toolProgress` accepts explicit `Backpressure`, `Dropping`, `Sliding`, and `Fail` policies with a positive safe-integer capacity. Omitted configuration defaults to backpressure at capacity 64, replacing the former unbounded queue. Lossy policies expose their dropped-update count in terminal `ToolExecutionCompleted.metadata` for completed success and tool-failure outcomes; the fail policy surfaces a typed `ProgressOverflowError`. Queue shutdown and the producer fiber share the event stream's scope, so downstream cancellation interrupts a suspended offer and aborts the tool context.

Add `ToolOutputStore` and `ToolOutput.bound` as the output-spill seam. `ToolOutput.bound` resolves `ToolOutputStore` optionally with `Effect.serviceOption`, so `Agent.stream` does not gain a hard service requirement. A store write returns `Option<string>`: `Some(path)` means the overflow was stored and Baton should replace inline output with a bounded `ToolOutput` envelope, while `None` means the store declines spill. This resolves the no-op-store case without sentinel paths or hard-coded implementation checks.

Output storage is an optional optimization after a tool has succeeded. `ToolOutput.bound` therefore returns `BoundedSuccess` without a typed failure channel: an absent store, `None`, or failure-only `ToolOutputError` cause produces the same deterministic bounded inline envelope with an empty path list. Causes containing interruption or defects propagate those unrecoverable reasons. The store boundary retains its typed `ToolOutputError` contract for direct and mandatory uses.

Bounding is idempotent. A Baton `ToolOutput` envelope is recognized by its complete bounded-inline metadata before storage, and rebounding returns its exact ordered `outputPaths` without calling `put`. A tighter bound truncates the existing preview again without respilling. This also makes repeated microcompaction and semantic compaction stable.

When spill happens, Baton stores `{ result, encodedResult }` and replaces both `result` and `encodedResult` with:

```json
{
  "inline": {
    "truncated": true,
    "bytes": 12345,
    "maxBytes": 16000,
    "preview": "bounded UTF-8 preview"
  },
  "outputPaths": ["mem:tool-output-1"]
}
```

The envelope stays in the `Ai.Response` vocabulary. Baton adds loop framing only and does not introduce a second turn payload format.

## Consequences

- Tool handlers and durable executors can read cancellation/progress/session data through normal Effect service lookup.
- Hosts can fold `ToolProgress` into their own event logs without affecting the model transcript.
- Standalone Baton keeps progress ordering and event payloads by default while replacing unbounded retention with bounded backpressure; `sessionId` defaults to `"local"`, progress is emitted only when a tool calls `emit`, and bounding leaves under-limit output unchanged.
- Loss or overflow requires an explicit non-default policy. Completed success and tool-failure outcomes expose loss through terminal metadata, and overflow under `Fail` uses a typed stream error; suspension, execution-channel failure, and downstream cancellation do not emit loss metadata.
- A successful tool result cannot become a failed turn because optional output storage failed; absent, declined, and typed-failed storage use bounded inline fallback.
- Repeated bounding preserves existing output paths and performs no additional storage write.
- Relay can back `ToolOutputStore` with a durable blob store without Baton depending on Relay.

## Rejected alternatives

- Expanding every executor/handler signature with callbacks beyond `Request`: rejected; `ToolContext` composes through Effect layers and keeps the executor seam focused on the call request.
- Making `ToolOutputStore` a required `Agent.stream` service: rejected; output spill is optional and should not grow the default loop requirement set.
- Returning a plain `string` from `ToolOutputStore.put`: rejected; a no-op store needs to decline spill without sentinel paths or throwing.
- Emitting progress as preliminary `Ai.Tool` handler results: rejected for M1; preliminary handler results remain a toolkit detail, while `ToolContext.emit` is the Baton progress seam.
- Keeping an unbounded progress queue: rejected because a fast tool can outrun a slow event consumer without a finite memory bound.
- Silently dropping progress by default: rejected because backpressure preserves every update and Effect queue offers suspend interruptibly without blocking a runtime thread.
- Storing every tool output unconditionally: rejected; small results remain inline and preserve current behavior.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/decisions/ADR-0001-baton-standalone-agent-framework.md`
