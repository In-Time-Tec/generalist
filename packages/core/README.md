# `@batonfx/core`

Focused composition guide for Baton's standalone, non-durable Effect-native agent loop.

## Install

```sh
bun add effect @batonfx/core @batonfx/test
```

## Imports

Import intentional public namespaces from the package root:

```ts
import { Agent, Chat, Memory, ModelMiddleware, Session, ToolOutput } from "@batonfx/core"
```

## Layer graph

```text
Persistence.layerBackingMemory
└─ Chat.layerPersisted ───────────> Chat.Persistence
TestModel.layer ─────────────────> LanguageModel
                    both ────────> Agent.generate
```

The persistence composition deliberately supplies both `Chat.Persistence` and `LanguageModel`. Persistence alone cannot run an agent.

## Runnable program

Checked source: [`../../examples/package-composition-guides/src/core.ts`](../../examples/package-composition-guides/src/core.ts)

```ts
import { Console, Effect, Layer } from "effect"
import { Persistence } from "effect/unstable/persistence"
import { Agent, Chat } from "@batonfx/core"
import { TestModel } from "@batonfx/test"

const applicationLayer = Layer.mergeAll(
  TestModel.layer([TestModel.text("I will remember that."), TestModel.text("Your name is Ada.")]),
  Chat.layerPersisted({ storeId: "composition-guide-chats" }).pipe(Layer.provide(Persistence.layerBackingMemory)),
)

const agent = Agent.make("assistant", { instructions: "Answer concisely." })

const program = Effect.gen(function* () {
  yield* Agent.generatePersisted(agent, {
    prompt: "My name is Ada.",
    persistence: { chatId: "user-42" },
  })
  const result = yield* Agent.generatePersisted(agent, {
    prompt: "What is my name?",
    persistence: { chatId: "user-42" },
  })
  yield* Console.log(result.text)
}).pipe(Effect.provide(applicationLayer))

await Effect.runPromise(program)
```

Run `bun examples/package-composition-guides/src/core.ts`. The program remains lazy and composable until the single explicit, final `Effect.runPromise` application boundary; there are no Promise-based internals.

## Errors, requirements, and resources

The merged layer discharges `Chat.Persistence` and `LanguageModel`, so the program has `R = never` and succeeds with `void`. Its error channel is `Agent.RunError`: `AgentError | AgentSuspended | ResumeMismatch | TurnPolicyError | TurnPolicyStopped | TurnLimitExceeded | MiddlewareViolation | DuplicateToolCallId | ProgressOverflowError | ToolNameCollision | AiError | LanguageModelNotRegistered | FrameworkFailure`. Sole persistence and model failures map to `AgentError`; compound model causes retain their typed branches, and tool framework faults remain `FrameworkFailure`. `history` and `persistence` are mutually exclusive. The memory backing store is owned by its layer. The sequential example has no timers, detached fibers, buffers, or concurrent work.

## More

- Governing spec: [Baton Agent Framework](../../docs/spec/01-baton-agent-framework.md)
- Deeper examples: [tool-calling chatbot](../../examples/tool-calling-chatbot/) and [memory chat](../../examples/memory-chat/)
- Baton uses Effect AI `Tool` and `Toolkit` directly. Toolkit handler layers run ordinary in-process tools; optional `ToolExecutor` routes external or durable placement without introducing another tool format.
- Canonical layer names are `Memory.layerNoop`, `ModelMiddleware.layerIdentity`, `Session.layerMemory`, `ModelRegistry.layerMemory`, and `ToolOutput.layerMemory`. The former noun-first names remain exact deprecated aliases through the stated pre-1.0 deprecation window.
- Persisted chat delegates storage to Effect AI `Chat.Persistence`. Reusing a `chatId` carries history across runs; the system message is stored once, and requesting persistence without its layer fails loudly with `AgentError`.

### Memory item content

`Memory.Item.content` accepts only Effect AI user-message parts: text and files. Protocol transcript parts such as reasoning, tool calls/results, and approval parts cannot be recalled as memory items.

```ts
import { Array } from "effect"
import { Memory, Prompt } from "@batonfx/core"

const item: Memory.Item = {
  id: "fact-1",
  content: [Prompt.makePart("text", { text: "prefers dark mode" })],
}

const migrated: Memory.Item = {
  id: legacy.id,
  content: Array.getSomes(legacy.parts.map(Memory.itemFromPromptPart)),
}
```

This is a breaking correction from the former `parts: ReadonlyArray<Prompt.Part>` field. Rename `parts` to `content`; when legacy storage contains broad prompt parts, use `Memory.itemFromPromptPart` to filter them explicitly or reject the legacy item if any conversion returns `Option.none`. Baton never converts protocol parts to lossy text.

### Tool execution placement

Baton uses Effect AI `Tool` and `Toolkit` values directly. For ordinary in-process tools, provide the handler layer from `toolkit.toLayer(...)` and no `ToolExecutor` is required. `ToolExecutor` is the optional override seam for durable waits and external placement. Its route helpers keep placement explicit while reusing the same toolkit definitions:

```ts
import { Effect, Schedule } from "effect"
import { ToolExecutor } from "@batonfx/core"

const executorLayer = ToolExecutor.router([
  ToolExecutor.remote({
    toolkit,
    retrySafe: true,
    operationKey: ({ call, sessionId }) => `${sessionId}:${call.id}`,
    maxRetries: 2,
    schedule: Schedule.exponential("100 millis"),
    execute: ({ call, operationKey }) =>
      remoteWorker
        .call(call.name, call.params, { operationKey })
        .pipe(Effect.map((result) => ({ _tag: "Success", result }))),
  }),
])
```

Remote routes execute once by default. Set `retrySafe: false` explicitly for non-idempotent work. Enable retries only when the remote endpoint deduplicates the supplied stable `operationKey`; `maxRetries` bounds even an otherwise unbounded schedule. A legacy `schedule` without `retrySafe: true` is ignored. Client, MCP, sandbox, and custom routes remain one-shot and require no migration.

`ToolExecutor.execute` returns `Success | DomainFailure | Suspend`. A declared domain failure retains both `failure`, the decoded value, and `encodedFailure`, the value encoded by the tool's failure schema. Decode, encode, handler-boundary, missing-handler, route, placement, and authorization failures fail the Effect with schema-backed `FrameworkFailure` instead of becoming tool output.

This is an exhaustive-match migration from the former message-only `Failure` outcome:

```ts
executor.execute(request).pipe(
  Effect.tap((outcome) =>
    outcome._tag === "DomainFailure" ? recordDomainFailure(outcome.failure, outcome.encodedFailure) : Effect.void,
  ),
  Effect.catchTag("@batonfx/core/FrameworkFailure", recordFrameworkFailure),
)
```

Placement adapters likewise return `DomainFailure { failure }` instead of `Failure { message }`. Baton validates and encodes the supplied value against the selected tool's declared failure schema.

### Turn policy migration

Baton's loop builds its `Ai.Chat` internally and discards it when the run ends, so a standalone app has no conversation continuity between runs. Use `Agent.generatePersisted` to run the loop on a **persisted** chat instead: the chat identified by `chatId` is created on first use and accumulates history across runs.
`TurnPolicy` decision Effects expose their requirements and typed `TurnPolicyError` failures. Stops require a schema-backed reason, and only `TurnLimit` is surfaced as `TurnLimitExceeded`; other stops surface as `TurnPolicyStopped` with the reason and pending tool checkpoint.

```ts
const policy = TurnPolicy.make<Budget>(({ turn }) =>
  Effect.gen(function* () {
    const budget = yield* Budget
    return budget.remaining(turn) === 0
      ? TurnPolicy.decision.stop({ _tag: "BudgetExhausted", budget: "tokens" })
      : TurnPolicy.decision.continue()
  }),
)
```

Migrate `TurnPolicy.decision.stop` to `TurnPolicy.decision.stop(reason)`. Existing reasonless custom policy functions can be passed to deprecated `TurnPolicy.fromLegacy` while migrating; legacy stops become `Policy { detail: "Legacy policy stopped" }`. `TurnLimitExceeded` now includes the configured `limit`, and transport consumers must add `TurnPolicyError` and `TurnPolicyStopped` to their terminal-failure handling.
// Or SQL-backed on the app's own database (requires a SqlClient in context):
// Chat.layerPersisted({ storeId: "my-app-chats" }).pipe(
// Layer.provide(Persistence.layerBackingSql),
// )

const agent = Agent.make("assistant", { instructions: "You are a helpful assistant." })

// Run 1 and run 2 share the same chatId, so run 2 sees run 1's history.
const program = Effect.gen(function* () {
const first = yield* Agent.generatePersisted(agent, {
prompt: "My name is Ada.",
persistence: { chatId: "user-42" },
})
const second = yield\* Agent.generatePersisted(agent, {
prompt: "What is my name?",
persistence: { chatId: "user-42" },
})
return [first.text, second.text]
}).pipe(Effect.provide(persistenceLayer))

```

Notes:

- Persisted entrypoints expose `Chat.Persistence` in their Effect requirement, so a missing layer is caught by type checking.
- Ordinary run options reject `persistence`; persisted run options require it and reject `history`.
- `Agent.provideModel(layer)` embeds an infallible language-model layer and discharges `LanguageModel` from the agent requirements while preserving the layer's own requirements and scoped lifetime.
- On a persisted chat the agent's system message is stored once on the first run and not re-added on subsequent runs.
```
