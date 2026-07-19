# `@batonfx/transport`

Focused composition guide for replayable wire and in-process session transport.

## Install

```sh
bun add effect @batonfx/core @batonfx/test @batonfx/transport
```

## Imports

```ts
import { Client, Errors, SessionRegistry, Sse, Wire, Ws } from "@batonfx/transport"
```

## Layer graph

```text
Persistence.layerBackingMemory ──> Chat.layerPersisted
TestModel.layer ─────────────────> LanguageModel
             both ───────────────> SessionRegistry.layerMemory
                                   └─ provides SessionRegistry
```

## Runnable program

Checked source: [`../../examples/package-composition-guides/src/transport.ts`](../../examples/package-composition-guides/src/transport.ts)

```ts
import { Console, Effect, Layer } from "effect"
import { Persistence } from "effect/unstable/persistence"
import { Agent, Chat } from "@batonfx/core"
import { TestModel } from "@batonfx/test"
import { SessionRegistry } from "@batonfx/transport"

const agentServices = Layer.mergeAll(
  TestModel.layer([TestModel.text("Hello from transport.")]),
  Chat.layerPersisted({ storeId: "composition-guide-sessions" }).pipe(Layer.provide(Persistence.layerBackingMemory)),
)

const registryLayer = SessionRegistry.layerMemory({
  agent: Agent.make({ name: "transport-agent" }),
  onConcurrentMessage: "enqueue",
  pendingMessageCapacity: 16,
  maxConcurrentRuns: 4,
}).pipe(Layer.provide(agentServices))

const program = SessionRegistry.SessionRegistry.use((registry) =>
  registry
    .open({ sessionId: "guide-session" })
    .pipe(Effect.flatMap((session) => Console.log(`opened ${session.sessionId}`))),
).pipe(Effect.provide(registryLayer))

await Effect.runPromise(program)
```

Run `bun examples/package-composition-guides/src/transport.ts`.

## Fixed and runtime-dynamic wire capabilities

Fixed-tool endpoints keep exact startup-toolkit validation. Passing a toolkit directly remains shorthand for the explicit fixed capability:

```ts
const fixed = { capability: "fixed", toolkit } as const

Wire.codec(fixed)
Sse.streamSuccess(fixed)
Sse.respond(fixed)({ sessionId, request })
Ws.handle(fixed)
```

Agents that expose `activate_skill` or discover tools after startup must select the runtime-dynamic capability for the complete server endpoint:

```ts
const dynamic = { capability: "runtime-dynamic" } as const

Wire.codec(dynamic)
Sse.streamSuccess(dynamic)
Sse.respond(dynamic)({ sessionId, request })
Ws.handle(dynamic)
```

The dynamic path validates frame tags, sequences, common event fields, call ids/names, progress fields, and result flags, but tool parameters and results are `unknown`. Browser SSE and WebSocket clients decode this honest loose frame type. This does not authorize tools or weaken core collision and framework-failure handling.

## Errors, requirements, and resources

The layers supply `SessionRegistry`, `LanguageModel`, and chat persistence, leaving `R = never`; success is `void`, while `open` retains schema-backed `SessionError`. Registry `send` can also fail with `SessionBusy` or `SessionQueueFull`, `attach` can fail with `SubscriberLagged`, and client transport operations use `TransportError`. The in-memory registry owns session fibers and journals for its layer lifetime. This composition enables FIFO enqueueing, bounds pending messages at capacity **16**, and bounds concurrent runs at **4**; subscriber and replay buffers are also bounded by registry policy.

## More

- Current behavior: [Transport](../../docs/features/transport.md)
- Deeper example: [HITL over SSE](../../examples/hitl-over-sse/)
- Canonical root namespaces are `Client`, `Errors`, `SessionRegistry`, `Sse`, `Wire`, and `Ws`. Established `client`, `errors`, `session-registry`, `sse`, `wire`, and `ws` subpaths remain compatibility imports through the stated pre-1.0 deprecation window.
