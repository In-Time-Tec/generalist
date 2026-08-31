# Test kit

`generalist/test` runs real Effect AI calls against an atomic scripted model and captures normalized requests without credentials or a test-runner dependency. Its companion conformance entrypoints register shared contracts for Runtime drivers and kernel providers.

## Usage

```ts
import { it, expect } from "@effect/vitest"
import { Effect } from "effect"
import { LanguageModel } from "effect/unstable/ai"
import { TestModel } from "generalist/test"

it.effect("replays a conversation and captures requests", () =>
  Effect.gen(function* () {
    const model = yield* TestModel.make([
      TestModel.toolCall("lookup", { orderId: "42" }, { id: "call-1" }),
      TestModel.text("Order 42 shipped."),
    ])

    const first = yield* LanguageModel.generateText({ prompt: "Find 42" }).pipe(Effect.provide(model.layer))
    const second = yield* LanguageModel.generateText({ prompt: "It shipped" }).pipe(Effect.provide(model.layer))

    expect(first.toolCalls[0]).toMatchObject({ name: "lookup", params: { orderId: "42" } })
    expect(second.text).toBe("Order 42 shipped.")
    expect((yield* model.requests).map((request) => request.index)).toEqual([0, 1])
  }),
)
```

## What runs

```text
LanguageModel.generateText({ prompt: "Find 42" })
└── TestModel.claim()                 cursor: 0 -> 1
    ├── capture Request
    │   { index: 0, operation: "generateText", prompt: ... }
    └── replay script[0]
        { type: "tool-call", id: "call-1", name: "lookup",
          params: { orderId: "42" }, providerExecuted: false }

LanguageModel.generateText({ prompt: "It shipped" })
└── TestModel.claim()                 cursor: 1 -> 2
    ├── capture Request { index: 1, operation: "generateText" }
    └── replay script[1] { type: "text", text: "Order 42 shipped." }
```

```text
RI  ProviderOptions { prompt, tools, toolChoice, responseFormat, ... }
    │ captureRequest(index, method, options)
RO  Request { index: 0, operation: "generateText", prompt, tools, ... }
    │ compileGenerate(script[0], 0)
RO  Response parts [tool-call "call-1", finish "tool-calls"]
```

## Invariants

- One fixture owns one atomic FIFO cursor shared by streaming and non-streaming calls.
- A request is captured before scripted delay or failure; concurrent claims receive distinct increasing indexes.
- A claimed slot remains consumed after failure or interruption, so retries use later slots.
- Exhausted calls are captured, do not advance the cursor, and fail with Effect AI `InvalidRequestError`.
- `requests` capture the normalized prompt, tools, tool choice, response format, operation, previous response id, and incremental prompt; `prompts` projects their prompts.
- `remaining` never falls below zero, and `awaitRequests(count)` waits in Effect until at least that many requests are captured.
- A fixture exposes a direct `LanguageModel` `layer`, `selection`, `registration`, and `registryLayer`; `layerRegistry` combines fixtures for `ModelRegistry` selection.
- Rebuilding a fixture's direct or registry layer does not reset its cursor or captures.
- Top-level text, reasoning, and tool-call parts each consume one model invocation; `turn` groups parts and controls finish reason, usage, delay, and stream pacing.
- Tool-call ids are explicit or deterministic from request and part indexes; a turn containing a tool call defaults to finish reason `tool-calls`.
- `object` is valid only for `generateObject`; operation/step mismatches fail with `InvalidRequestError`.
- `failure` replays its typed Effect AI error; JSON object encoding failures become `InvalidRequestError`.
- `streamPartDelay` delays every encoded provider part independently, exposing reasoning, text, tool, and finish transitions to schedulers.
- `truncated` is streaming-only: it emits `response-metadata`, then complete leading parts, and ends without `finish` at the selected stop point.
- `stopAfter: "tool-params-delta"` emits `tool-params-start` and incomplete parameter JSON, but no closing `tool-call`.
- Behavior-bearing seams use their own `layerTest(implementation)` for exact substitutes and `layerMemory` where process-local state is part of the seam.
- `generalist/test/runtime-driver` depends on `@effect/vitest`; `driverConformance` registers only the capabilities supplied by a host.
- Runtime driver capabilities cover admission identity/idempotency, Runtime control and durable events, RunTree replay cursors, SQL transactions, multi-worker claims/fencing, and notification recovery through durable replay.
- A Runtime driver supplies its public Runtime/RunStore Layer and address; optional `setup` provisions or resets external storage before each test.
- Driver adapters keep backend operations explicit: `claim` activates a Run, `forceRollback` injects transaction failure, and `expire` invalidates one exact worker claim.
- Multi-worker conformance may use a separate Layer containing `RunClaims`; unsupported capabilities are omitted, never faked.
- Runtime conformance does not expose a driver's database schema or persisted Run representation.
- `KernelProviderConformance.kernelProviderConformance` always registers shared KernelPool lifecycle tests and registers remote ownership, takeover, recovery, cleanup, and redaction tests only when a remote harness is supplied.

## Related

- Source: `packages/generalist/src/test/...`
- Site: `/docs/guides/testing-evals`, `/docs/reference/test`
