# TenetKit And Rika Linear Durable History Plan

## Purpose

Replace growing durable state copies with one canonical Session message log, small execution references, bounded semantic events, and incremental Rika views. TenetKit releases first. Rika then pins the published TenetKit release and publishes through its canonical workflow.

This is a clean break. Do not preserve transcript-bearing Runtime events, transcript-bearing Runtime results, full-path operation outcomes, or full-view patch application.

## Simple Model

```text
Rika prompt
  -> TenetKit Run
  -> Session path loaded in memory
  -> provider receives the effective prompt
  -> new response stored once in Session
  -> operation and event keep its Session entry id
  -> Rika projects only changed units
  -> TUI applies only changed units
```

The provider may receive the full effective prompt. Durable storage must not record another full prompt copy for each step.

## Ownership

- Core `SessionStore` owns canonical model-facing conversation entries and branch order.
- Core model/tool loops own live rich values needed while an attempt is running.
- Runtime owns Runs, claims, fences, operations, waits, recovery, and a small semantic event log.
- `ToolOutputStore` owns large tool bytes; Session and Runtime retain bounded previews and immutable references.
- Rika owns disposable Thread/Turn transcript projections and indexed interactive views.
- Provider caches and live preview streams are optimizations, never durable authority.

## Invariants

### Store content once

A model response is one canonical Session message. A model operation result and `ModelResponseCommitted` identify that message by `{ sessionId, entryId, digest }`; they do not copy the input path or response content.

A Session synchronization operation returns a small cursor, never `ReadonlyArray<Session.Entry>`.

Large tool output is stored through `ToolOutputStore`. Durable tool outcomes and events contain a bounded preview, digest, byte count, and output reference rather than unlimited bytes.

### Cost follows new information

For fixed-size new content, operation bytes, event bytes, Session bytes, and Rika projection bytes grow linearly with turns. No per-turn row contains an earlier turn's complete transcript.

Runtime event count is `O(Runs + model calls + tool calls + lifecycle transitions)`. Event size is bounded by one new semantic delta plus fixed metadata.

### Keep replay strong

Stable operation identity, input digest, replay policy, exact claim/fence, mismatch guards, suspension, cancellation, child settlement, and terminal cursor authority remain.

A settled `never` operation is replayed from its canonical Session entry and never contacts the provider again. An interrupted unresolved `never` operation remains `needs-resolution`.

Model response Session append, compact operation outcome, post-operation checkpoint, and compact semantic event commit atomically. An exact retry is idempotent; a divergent retry fails.

### Keep process-local Core useful

Direct `Agent.stream` and `Agent.generate` may return rich `Prompt` values. Runtime maps those rich live values to compact durable representations. Process-local API convenience does not dictate Runtime storage shape.

### Views are disposable

Rika projection tables and interactive ThreadView state can be deleted and rebuilt from TenetKit events plus referenced Session entries. A patch validates its own revision and changed keys; it does not revalidate, copy, map, and sort the full view.

## Target Contracts

```ts
interface SessionCursor {
  readonly sessionId: string
  readonly leafId: string | null
  readonly entryCount: number
}

interface ModelResponseRef {
  readonly sessionId: string
  readonly entryId: string
  readonly digest: string
}

interface CompletedModelOperation {
  readonly operationId: string
  readonly turn: number
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
  readonly inputLeafId: string | null
  readonly response: ModelResponseRef
}

interface ModelResponseCommitted {
  readonly _tag: "ModelResponseCommitted"
  readonly turn: number
  readonly operationKey: string
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
  readonly response: ModelResponseRef
}

interface AgentExecutionResult {
  readonly text: string
  readonly turns: number
  readonly session: SessionCursor
}
```

Core may use an internal inline model completion before Runtime commits it. Runtime persists only the reference form. Replay resolves the exact entry and its exact parent path through `SessionStore`.

`TurnCompleted` becomes a small boundary fact:

```ts
interface TurnCompleted {
  readonly _tag: "TurnCompleted"
  readonly turn: number
  readonly session: SessionCursor
  readonly usage?: Usage
  readonly finishReason?: FinishReason
}
```

Tool events may carry a bounded current semantic preview when authored-order Session linking has not happened yet. They may never carry unbounded raw output or an accumulated transcript.

## Topology

```text
Core Agent
  -> SessionStore.append(new message)
  -> DriverJournal.onCompleted(inline completion)

Runtime atomic commit
  -> verify claim, fence, operation identity, and digest
  -> append/verify canonical Session response
  -> persist compact operation result
  -> append compact Run event
  -> advance checkpoint
  -> publish after commit

Rika
  -> watch compact tree event
  -> resolve referenced Session entry
  -> update transcript rows
  -> emit changed-unit patch
  -> indexed ThreadView applies changed keys
```

## Migration And Deletion

- Bump every Runtime store schema version. Old compact-incompatible execution databases fail the existing checksum gate; Rika archives its rebuildable TenetKit database through the existing recovery path.
- Keep Rika product Threads, Turns, and transcript projections. They rebuild when TenetKit execution state is replaced.
- Delete `CompletedModelOperation.messages` from persisted results.
- Delete full Session paths from `memory:sync` results.
- Delete `Prompt.Prompt` from durable `TurnCompleted`.
- Delete `Prompt.Prompt` from Runtime `AgentExecutionResult` and child terminal payloads.
- Delete obsolete retry/state fields that carry transcript values once all recovery loads Session by cursor.
- Do not add a legacy decoder or dual-write compatibility path.

## Implementation Order

1. Add failing byte-growth and payload-shape tests around Session sync, model completion, terminal events, and 1/5/10/20-turn SQLite runs.
2. Make Session sync return and replay a cursor while callers resolve the path from `SessionStore`.
3. Commit model response content once, persist operation/event references, and hydrate replay from the referenced Session path without provider contact.
4. Replace transcript-bearing Runtime turn/terminal results with Session cursors; load recovery history from Session.
5. Bound/externalize large tool outputs through the existing `ToolOutputStore` seam.
6. Update SQLite, PostgreSQL, MySQL, and memory stores with identical atomic and idempotent behavior.
7. Release TenetKit and verify packages, checksums, isolated Bun/npm installs, restart, child resume, failure settlement, and linear byte growth.
8. Pin the published TenetKit train in Rika. Resolve response references in the TenetKit adapter.
9. Replace repeated `ThreadView.apply(snapshot, patch)` work with a private indexed accumulator that materializes a snapshot only at wire/render boundaries.
10. Run the four-child forty-turn product proof, package native targets, verify isolated installation, and publish Rika.

## Proof Matrix

- Session sync cursor: operation `result_json` stays bounded while Session path length grows.
- Model replay: committed `never` result survives restart, provider counter remains zero, referenced message and tool calls are exact.
- Unknown model call: interrupted `never` operation remains `needs-resolution`; no provider retry.
- Atomicity: fault before/after Session append, operation result, event insert, and commit exposes either no completion or one exact completion.
- Child recovery: reopen after two of four children settle; remaining children finish and parent resumes once in authored order.
- Linear storage: fresh 1/5/10/20-turn runs satisfy `increment(20) <= 2.2 * increment(10)` for parsed operation, event, Session, and projection bytes after fixed baseline subtraction.
- Payload shape: no durable lifecycle row contains a complete earlier transcript; maximum lifecycle row size does not grow with turn ordinal.
- Rika cursor: terminal product state is published only after matching TenetKit terminal status and exact cursor.
- Incremental view: one-unit patch performs work proportional to changed turns/units, while snapshot/resync remains byte-equivalent.
- Packaging: canonical checks, package smoke, local-tarball Rika integration, release smoke, checksums, and isolated installs pass from exact release commits.

## Rejected Designs

- Content-addressing each complete accumulated transcript: every version has a different digest, so growth remains quadratic.
- Periodic database deletion or process restart: hides amplification and weakens audit/recovery.
- Weakening mismatch or cursor guards: converts visible divergence into duplicate execution.
- Sending only provider deltas as the general model protocol: most providers still require effective context, and transport caching is not durable state.
- Another Rika batching layer: TenetKit would still pay the storage and encoding cost before batching.

# Prompt Cache Plan (provider cache_control breakpoints)

Shipped in 0.27.0: core policy, adapter automatic caching default, supplemental system block, and tests.
Open follow-ups: prompt-prefix diagnostics events and per-purpose policy inputs from Rika.
Adaptive idle-gap escalation shipped in 0.27.1: the conversation boundary takes the one-hour TTL
once a run idles past the five-minute cache lifetime.

Live verification through the switchboard (2026-08-16): the shipped explicit-marker policy reads
99.5% of a continuation prompt (3597 of 3613 tokens; only the new tail written). A top-level
automatic cache_control field overrides explicit per-block markers (the explicit 1h system marker
was ignored and the prefix landed in the 5m bucket), so automatic caching remains caller opt-in.

## Problem

Production telemetry (Rika, Aug 3-15): 30.9% aggregate input cache hit, 3.1% on Anthropic
(37.5M uncached input tokens, cacheWrite median 0). TenetKit never placed `cache_control` breakpoints,
so Anthropic re-processed and re-billed the entire conversation on every model call.

## Ownership

- Core owns cache breakpoint placement (it owns the model call) and prompt-prefix diagnostics.
- Rika owns the policy inputs (system split, TTL choices, adaptive TTL) and the % cached display.

## Work

1. `packages/core/src/model/prompt-cache.ts`: provider-aware policy marking the first system message
   `options.anthropic.cacheControl = { type: "ephemeral", ttl: "1h" }` plus
   `options.amazonBedrock.cachePoint = true`, later system messages the five-minute variant, and the
   last user or tool message its last part. Anthropic/Bedrock-keyed options are inert on
   OpenAI/OpenRouter adapters. Four-breakpoint cap. Applied in `model-turn.ts` only on the prompt
   passed to `LanguageModel.streamText`; derived at send time, never persisted.
2. Anthropic adapter default: top-level `cache_control` automatic caching field via the adapter's
   request config default (it spreads straight into the request body), so tools get cached even
   though beta.98 cannot mark them per-message. Explicit per-block markers take precedence.
3. `Agent.make` `supplemental` instructions emitted as a second system message after the primary
   block, preserved through Session rebuilds, resume seeding, and durable manifests.
4. Tests: marker placement, gap filling, budget cap, purpose gating, wire-prompt integration,
   supplemental ordering, adapter default config.

Release: published as v0.27.0; Rika pins it. Full plan, provider matrix, and verification gates
live in the Rika repo PLAN.md.
