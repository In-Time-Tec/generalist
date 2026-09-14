---
title: "Live multimodal connections"
description: "Adapt provider-neutral text, audio, image, and tool turns without making transient frames durable authority."
---

`generalist/live` is the small process-local boundary for a bidirectional provider connection. Applications supply a `LiveProvider` Layer, acquire a `Connection` inside an Effect `Scope`, send Effect AI prompt parts, and consume one ordered event stream. Generalist ships a deterministic test provider, not a vendor adapter, transport, codec, device, or reconnect policy.

```ts
import { Effect, Fiber, Stream } from "effect"
import { Prompt, Toolkit } from "effect/unstable/ai"
import { LiveProvider } from "generalist/live"

const program = Effect.scoped(
  Effect.gen(function* () {
    const provider = yield* LiveProvider
    const connection = yield* provider.connect({
      capabilities: {
        input: [{ modality: "text", mediaTypes: [] }],
        output: [{ modality: "text", mediaTypes: [] }],
        tools: false,
        interruption: true,
      },
      delivery: { _tag: "Backpressure", capacity: 32 },
    })

    const events = yield* Stream.runForEach(connection.events, Effect.log).pipe(Effect.forkScoped)
    yield* connection.send(Prompt.textPart({ text: "Describe what you can see." }))
    yield* connection.commitInput({
      assignment: { turnId: "turn-1", assignmentId: "model-operation-4" },
      context: Prompt.empty,
      toolkit: Toolkit.empty,
    })
    yield* Fiber.join(events)
  }),
)
```

## Capabilities and content

Providers advertise input and output `Capabilities`. A connection request states requirements, not preferences: a missing modality, exact media type, tool support, interruption support, or delivery policy fails with `UnsupportedCapability`. Implementations may support any subset of text, audio, and image.

Text and files use Effect AI `Prompt` and `Response` parts rather than a second content vocabulary. `inputFilePart({ mediaType, data, fileName? })` constructs an Effect AI file part narrowed to `Uint8Array` bytes; audio and images are distinguished by negotiated media types. Each file part is an independently meaningful item in its declared provider format. This contract does not define codecs, encoded-stream chunk boundaries, capture, playback, or conversion. A provider must not mutate an emitted byte array; a receiver that retains bytes beyond an operation must copy them.

`send` buffers one current live input part. `commitInput(request)` explicitly requests one semantic model turn; silence detection and automatic endpointing are not implicit. The request's full Effect AI `Prompt.Prompt` is authoritative context: it replaces provider-maintained history, may carry canonical system, user, assistant, tool-call, and tool-result messages on a fresh connection, and must exclude current parts already supplied through `send` so those parts are appended exactly once. A context-only request is valid, but merely supplying history or a tool result never auto-starts another turn—the caller must invoke `commitInput`.

Each request also supplies the complete active `Toolkit` for that turn, replacing any earlier tool set. This keeps reconnect and per-turn tool changes explicit rather than freezing tools at connection acquisition. Only one provider output turn may be active on a connection. `TurnAssignment` is caller-owned and every event for the turn carries it, so a framework can correlate provisional observations with its own model operation without importing Runtime identity into Live.

## Provisional frames and semantic completion

Every accepted event receives one contiguous, zero-based `sequence`. `Output` events are explicitly `provisional: true`; they are suitable for immediate display or playback, but are not the semantic result. `TurnCompleted.response` is the complete Effect AI response used by a model-operation/tool-batch boundary. A provider emits complete `ToolCall` values, never raw vendor argument fragments, does not execute application tools, and does not start an independent continuation turn.

Applications own tool validation, authorization, execution, and cancellation. They may return an Effect AI `Prompt.ToolResultPart` through `sendToolResult`, then explicitly commit the next request, or place historical calls and results in the next authoritative `Prompt.Prompt` after reconnect. Neither path starts a continuation automatically. Tool-call IDs are unique for the connection. Unknown, duplicate, mismatched, and interrupted-call results submitted through `sendToolResult` fail with `InvalidCommand`.

`interrupt(turnId)` targets one exact active turn. A stale identity cannot interrupt its successor. Interruption emits `TurnInterrupted`, invalidates unresolved calls from that turn, and permits later input; it does not cancel an application tool fiber, durable Session, or Runtime Run. Each `TurnStarted` is followed by one `TurnCompleted` or `TurnInterrupted` unless connection termination cuts it short. No output follows a turn terminal event.

## Bounded delivery and lifecycle

Delivery capacity is a positive integer measured in events. `Backpressure` admits events only as the sole consumer drains capacity. `Fail` preserves the accepted prefix and then fails the stream with `DeliveryOverflow`; it never drops or slides semantic events. Providers must serialize sequence allocation with admission and must not hide an unbounded queue or fork unbounded blocked offers behind either policy.

The owning Effect `Scope` owns the provider connection and its resources. The event stream may be materialized once; another materialization fails with `EventsAlreadyConsumed`. If that consumer stops early, the connection stops admission. Explicit `close` is idempotent: it stops admission, preserves accepted events, emits exactly one final `Closed`, and ends normally. Connection loss preserves accepted events and then fails with `ConnectionLost`; it does not manufacture `Closed`. Scope exit releases resources immediately and need not emit a terminal event. The first terminal cause wins.

Command success means the adapter locally accepted an operation. It is not remote acknowledgement, exactly-once execution, durability, or permission to retry after ambiguous connection loss.

## Durability boundary

Live events and frames are transient process-local observations. They have no replay cursor and are never Session entries or Runtime authority. A durable host may later attach its own assignment identity and commit `TurnCompleted.response` through the existing model-operation boundary, but that integration belongs to the durable integration contract—not `generalist/live`.

The durable `Session` remains the authority for model-facing conversation history. Runtime journals remain the authority for accepted work, execution ownership, cancellation intent, tool outcomes, and terminal facts. Closing or losing a Live observer never rewrites those facts, and live interruption is distinct from durable cancellation.

## Testing providers

`generalist/testing/live` exports a deterministic `TestProvider` and reusable `register` conformance kit. The suite checks capability rejection, text/audio/image representation, explicit input commit, assignment propagation, provisional versus complete output, tool correlation, interruption, contiguous ordering, bounded overflow, connection loss, graceful terminal behavior, and sole-consumer enforcement.

## Related

- Source: `packages/generalist/src/live/`
- Testing: `packages/generalist/src/testing/live/`
- Durable authority: [`runtime.md`](./runtime.md), [`session-and-compaction.md`](./session-and-compaction.md)
