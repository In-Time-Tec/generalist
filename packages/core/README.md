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
Agent.layerRuntime ───────────────> Agent.Runtime
TestModel.layer ─────────────────> LanguageModel
                     all ────────> Agent.generate
```

The persistence composition deliberately supplies `Agent.Runtime`, `Chat.Persistence`, and `LanguageModel`. The runtime owns resources shared across concurrent runs; persistence alone cannot run an agent.

## Runnable program

Checked source: [`../../examples/package-composition-guides/src/core.ts`](../../examples/package-composition-guides/src/core.ts)

```ts
import { Console, Effect, Layer } from "effect"
import { Persistence } from "effect/unstable/persistence"
import { Agent, Chat } from "@batonfx/core"
import { TestModel } from "@batonfx/test"

const applicationLayer = Layer.mergeAll(
  Agent.layerRuntime,
  TestModel.layer([TestModel.text("I will remember that."), TestModel.text("Your name is Ada.")]),
  Chat.layerPersisted({ storeId: "composition-guide-chats" }).pipe(Layer.provide(Persistence.layerBackingMemory)),
)

const agent = Agent.make({ name: "assistant", instructions: "Answer concisely." })

const program = Effect.gen(function* () {
  yield* Agent.generate(agent, {
    prompt: "My name is Ada.",
    persistence: { chatId: "user-42" },
  })
  const result = yield* Agent.generate(agent, {
    prompt: "What is my name?",
    persistence: { chatId: "user-42" },
  })
  yield* Console.log(result.text)
}).pipe(Effect.provide(applicationLayer))

await Effect.runPromise(program)
```

Run `bun examples/package-composition-guides/src/core.ts`. The program remains lazy and composable until the single explicit, final `Effect.runPromise` application boundary; there are no Promise-based internals.

## Errors, requirements, and resources

The merged layer discharges `Agent.Runtime`, `Chat.Persistence`, and `LanguageModel`, so the program has `R = never` and succeeds with `void`. Its error channel is `Agent.RunError`: `AgentError | AgentSuspended | ResumeMismatch | TurnPolicyError | TurnPolicyStopped | TurnLimitExceeded | MiddlewareViolation | DuplicateToolCallId | ProgressOverflow | ToolNameCollision | AiError | LanguageModelNotRegistered | FrameworkFailure`. Sole persistence and model failures map to `AgentError`; compound model causes retain their typed branches, and tool framework faults remain `FrameworkFailure`. `history` and `persistence` are mutually exclusive. The runtime and memory backing store are owned by their layers. The sequential example has no timers, detached fibers, buffers, or concurrent work.

## More

- Current behavior: [Agent loop](../../docs/features/agent-loop.md)
- Deeper examples: [tool-calling chatbot](../../examples/tool-calling-chatbot/) and [memory chat](../../examples/memory-chat/)
- Baton uses Effect AI `Tool` and `Toolkit` directly. Toolkit handler layers run ordinary in-process tools; optional `ToolExecutor` routes external or durable placement without introducing another tool format.
- Layer names are `Memory.layerNoop`, `ModelMiddleware.layerIdentity`, `Session.layerMemory`, `ModelRegistry.layerMemory`, and `ToolOutput.layerMemory`.
- Persisted chat delegates storage to Effect AI `Chat.Persistence`. Reusing a `chatId` carries history across runs; the system message is stored once. Persisted runs require `Agent.Runtime` and `Chat.Persistence`; missing either layer fails loudly with `AgentError`.

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

Recalled items enter Chat as one user message carrying structural `memoryRecall` origin in Effect AI message options. Prompt middleware normally passes that marked message through unchanged; middleware that rebuilds its user content uses `Memory.replaceRecalledMessage` to retain its identity lineage. Compaction passes marked current-prompt messages through unchanged. Before every `Memory.remember`, core applies `Memory.projectTranscript` (or the lossless Session memory projection during compaction) so recalled context cannot be recursively stored. Identical user-authored text remains eligible for retention because projection never compares content. `RememberInput` and custom Memory implementations remain source-compatible; legacy histories without the option are treated as ordinary transcript content.

### Tool execution placement

Baton uses Effect AI `Tool` and `Toolkit` values directly. For ordinary in-process tools, provide the handler layer from `toolkit.toLayer(...)` and no `ToolExecutor` is required. `ToolExecutor` is the optional override seam for durable waits and external placement. Its route helpers keep placement explicit while reusing the same toolkit definitions:

Sibling framework tool calls execute serially unless the agent opts into concurrent execution. Even when handlers finish out of order, Baton emits their buffered events and checkpoints their results in provider call order:

```ts
const agent = Agent.make({
  name: "assistant",
  toolkit,
  toolExecution: { concurrency: 3 },
})
```

Use `toolExecution: { concurrency: "unbounded" }` when every framework tool call in a model turn should start without an application-level bound.

```ts
import { Effect, Schedule } from "effect"
import { ToolExecutor } from "@batonfx/core"

const executorLayer = ToolExecutor.layerRouter([
  ToolExecutor.remote({
    toolkit,
    idempotent: true,
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

Remote routes execute once by default. Set `idempotent: false` explicitly for non-idempotent work. Enable retries only when the remote endpoint deduplicates the supplied stable `operationKey`; `maxRetries` bounds even an otherwise unbounded schedule. A legacy `schedule` without `idempotent: true` is ignored. Client, MCP, sandbox, and custom routes remain one-shot and require no migration.

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

Baton's loop builds its `Ai.Chat` internally and discards it when the run ends, so a standalone app has no conversation continuity between runs. Use `Agent.generate` to run the loop on a **persisted** chat instead: the chat identified by `chatId` is created on first use and accumulates history across runs.
`TurnPolicy` decision Effects expose their requirements and typed `TurnPolicyError` failures. Stops require a schema-backed reason, and only `TurnLimit` is surfaced as `TurnLimitExceeded`; other stops surface as `TurnPolicyStopped` with the reason and pending tool checkpoint.

The default policy is `TurnPolicy.forever`: Baton imposes no follow-up-turn count, and a turn with no pending tool results still completes the run naturally. `forever` carries the portable snapshot `{ _tag: "Forever" }`, which is distinct from an absent snapshot (an opaque custom policy) and from a legacy persisted record with no policy field; it is never encoded as `Infinity`, `null`, or a `Recurs` sentinel. Consumers that relied on the previous implicit eight-follow-up cap must opt in explicitly with `TurnPolicy.recurs(8)`. Cancellation, interruption, budgets, and tool governance remain independent controls.

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

Custom policies return `TurnPolicy.decision.stop(reason)` for explicit, observable completion. `TurnLimitExceeded` includes the configured `limit`, and transport consumers must handle `TurnPolicyError` and `TurnPolicyStopped` as terminal failures.
// Or SQL-backed on the app's own database (requires a SqlClient in context):
// Chat.layerPersisted({ storeId: "my-app-chats" }).pipe(
// Layer.provide(Persistence.layerBackingSql),
// )

const agent = Agent.make({ name: "assistant", instructions: "You are a helpful assistant." })
const applicationLayer = Layer.mergeAll(Agent.layerRuntime, persistenceLayer, modelLayer)

// Run 1 and run 2 share the same chatId, so run 2 sees run 1's history.
const program = Effect.gen(function* () {
const first = yield* Agent.generate(agent, {
prompt: "My name is Ada.",
persistence: { chatId: "user-42" },
})
const second = yield\* Agent.generate(agent, {
prompt: "What is my name?",
persistence: { chatId: "user-42" },
})
return [first.text, second.text]
}).pipe(Effect.provide(applicationLayer))

```

Notes:

- Runs with `persistence` expose `Agent.Runtime | Chat.Persistence` in their Effect requirement, so a missing layer is caught by type checking.
- `RunOptions` accepts optional `persistence`, `history`, and `output` on the same two run functions.
- An agent's default model is its visible `model` selection, resolved through `ModelRegistry` at run time. For a registry-free run, omit `model` and provide a concrete `LanguageModel` layer at the `Agent.stream` or `Agent.generate` run boundary; the layer's requirements and scoped lifetime remain visible there.
- On a persisted chat the agent's system message is stored once on the first run and not re-added on subsequent runs.
```
