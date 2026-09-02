# Triggers

Generalist can suspend a durable tool call for a typed environmental event, admit that event exactly once, and schedule recurring fresh Runs. Webhook verification and filesystem watching are plain Effect capabilities, so a host can mount them without coupling the core package to an HTTP server or one filesystem implementation.

## Awaiting and waking

`Agent.WakeEvent` is a Schema union of `Timer`, `Webhook`, `ChildCompleted`, `FileChanged`, and `ApprovalResolved`. Every event carries a non-empty `dedupeKey`. A tool declares `Agent.AwaitEventResult` as its success Schema and returns `Agent.awaitEvent` from its handler:

```ts
import { Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import { Agent, ToolContext } from "generalist"

const waitForDeploy = Tool.make("wait_for_deploy", {
  parameters: Schema.Struct({}),
  success: Agent.AwaitEventResult,
  failure: Agent.AwaitEventInvalid,
}).addDependency(ToolContext.ToolContext)

const handler = () => Agent.awaitEvent({ _tag: "Webhook", source: "deploy" }, { timeout: "30 minutes" })
```

`awaitEvent` journals an `Awaiting { filter, deadline }` obligation and suspends without another model call. It is terminal handler control flow: code after `yield* Agent.awaitEvent(...)` is not resumed. The durable Runtime injects `Event` or `TimedOut` as that tool call's result, then reconstructs the Agent from its checkpoint. Strict replay does not dispatch the handler again.

```ts
const wake = runtime.wake(runId, {
  _tag: "Webhook",
  dedupeKey: "delivery-01",
  source: "deploy",
  payload: { status: "ready" },
  headers: {},
})
```

`runtime.wake` Schema-validates the event, journals `WakeReceived`, and atomically closes one matching wait. It returns `Resumed`, `Ignored`, or `Duplicate`. A dedupe key is unique within one Run; a duplicate journals `Duplicate` but cannot resume or dispatch work. The Runtime-scoped scheduler closes elapsed waits with `TimedOut` and resumes them through the same checkpoint path.

## Recurring fresh Runs

`runtime.schedule(agent, input, { rrule, sessionId, budget })` validates and encodes the Agent input when the schedule is registered. Each occurrence starts a fresh Run with idempotency key `schedule:<scheduleId>:<occurrence>` and the captured budget. A failed scheduler attempt retries that same occurrence identity before advancing the durable schedule.

The supported recurrence subset is intentionally small and UTC-only:

- `FREQ=SECONDLY`, `FREQ=MINUTELY`, `FREQ=HOURLY`, or `FREQ=DAILY`
- optional positive integer `INTERVAL`, for example `FREQ=HOURLY;INTERVAL=6`
- no calendar selectors, time zones, end dates, or exceptions

Memory, SQLite, PostgreSQL, and MySQL persist schedules in their Runtime store. The scheduler fiber belongs to the Runtime Layer scope. SQL schedule claims use leased transactional row claims so competing Runtime instances admit one occurrence. Timer input is Schema-validated through the scheduled Agent's input Schema before persistence.

## Webhooks

`Triggers.ingestWebhook` is a plain Effect function rather than an HTTP route. Define a source with its payload Schema and verification policy, then pass the raw request body and headers:

```ts
import { Redacted, Schema } from "effect"
import { Triggers } from "generalist"

const github = Triggers.source({
  source: "github",
  payload: Schema.Struct({ action: Schema.String }),
  signature: Triggers.github(Redacted.make(secret)),
})

const ingestion = Triggers.ingestWebhook({
  source: github,
  body: rawBody,
  headers,
})
```

Built-in policies cover GitHub `sha256=`, Slack `v0=` with timestamp tolerance, configurable HMAC-SHA256 headers, and explicit unsigned sources. Signatures always cover the raw body. GitHub delivery IDs and signature headers supply default dedupe identities; unsigned sources must pass `dedupeKey`. An HTTP server can mount this function and then call `runtime.wake`; the core package does not expose a route.

## Filesystem events

`Watcher.layer` requires Effect's `FileSystem.FileSystem` and exposes `Watcher.watch({ path, recursive })`, a stream of typed `FileChanged` wake events. Hosts without `FileSystem.watch` omit this Layer. The watcher does not choose a Run: the host consumes its stream and calls `runtime.wake` for the intended waiting Run.

## Durable invariants

- Wake receipt, per-Run dedupe, matching wait closure, and resume are one authoritative store transition.
- A matching event or timeout closes an open wait at most once.
- Awaiting does not spend model tokens; only the resumed Agent continuation can call the model.
- Schedule occurrence identity is deterministic, and the occurrence advances only after idempotent Run admission.
- Scheduler and watcher fibers have visible Layer scopes; closing the Runtime interrupts them.
