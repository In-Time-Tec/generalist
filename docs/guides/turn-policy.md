---
title: "How to control turn budgets"
description: "Bound follow-up turns with recurs and untilToolCall, compose policies with both, and apply per-turn overrides from decision.continue."
---

A `Policy` is a plain value on the agent that decides, after each turn with pending tool results, whether the loop runs again. Turn 0 always runs; the policy only gates follow-ups. The default is `Policy.forever`: no framework-imposed follow-up cap, so a finite cap like `Policy.recurs(8)` is an explicit choice. [The agent loop](/learn/agent-loop) explains where the decision point sits.

## 1. Pick a policy and compose constraints

Use `Policy.recurs(n)` for a fixed cap, `Policy.untilToolCall(name)` to stop once a named tool has produced a result, and `Policy.both` to require that two policies agree:

**compose-policies.ts**

```typescript
import { Schema } from "effect"
import { Agent, Policy } from "generalist"
import { Tool, Toolkit } from "effect/unstable/ai"

const submitAnswerTool = Tool.make("submit_answer", {
  description: "Submit the final answer",
  parameters: Schema.Struct({ answer: Schema.String }),
  success: Schema.String,
})

const _agent = Agent.make({
  name: "researcher",
  toolkit: Toolkit.make(submitAnswerTool),
  policy: Policy.both(Policy.recurs(4), Policy.untilToolCall("submit_answer")),
})
```

## 2. Observe what happens at the limit

When a configured recurrence cap stops while tool results are still pending, the run fails with `TurnLimitExceeded`. Other successful stops fail with `PolicyStopped` carrying the exact reason. Both carry the pending calls because the loop refuses to silently drop work:

**turn-limit.ts**

```typescript
import { Console, Effect, Layer, ManagedRuntime, Schema } from "effect"
import { Agent, AgentEvent, Approvals, ModelMiddleware, Permissions, Policy } from "generalist"
import { Tool, Toolkit } from "effect/unstable/ai"
import { TestModel } from "generalist/testing"

const lookupTool = Tool.make("lookup", {
  description: "Look up one fact",
  parameters: Schema.Struct({ topic: Schema.String }),
  success: Schema.String,
})

const toolkit = Toolkit.make(lookupTool)

const agent = Agent.make({
  name: "looper",
  toolkit,
  policy: Policy.recurs(1),
})

const modelLayer = TestModel.layer([
  TestModel.toolCall("lookup", { topic: "fact-1" }, { id: "lookup-1" }),
  TestModel.toolCall("lookup", { topic: "fact-2" }, { id: "lookup-2" }),
])

const program = Effect.gen(function* () {
  const failure = yield* Agent.run(agent, "Keep looking things up.").pipe(Effect.flip)
  if (!Schema.is(AgentEvent.TurnLimitExceeded)(failure)) {
    return yield* Effect.die("expected the policy to stop the run")
  }
  const pending = failure.pending.map((call) => call.tool_name).join(", ")
  yield* Console.log(`stopped before turn ${failure.turn} with pending results from: ${pending}`)
})

const runtimeLayer = Layer.mergeAll(
  modelLayer,
  toolkit.toLayer({ lookup: ({ topic }) => Effect.succeed(`found ${topic}`) }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
```

**Output**

```text
stopped before turn 2 with pending results from: lookup
```

## 3. Override instructions, model, or tools per turn

To steer late turns rather than end them, return `Policy.decision.continue(overrides)` from a custom policy. Overrides are selected for the next model call: `instructions` prepends a system message that remains in chat history, `model` swaps the model layer for that call, and `activeTools` narrows the toolkit for that call:

**override-turns.ts**

```typescript
import { Effect } from "effect"
import { Policy } from "generalist"

export const focusLateTurns: Policy.Policy = Policy.make((info) => {
  if (info.turn >= 6) return Effect.succeed(Policy.decision.stop({ _tag: "GoalSatisfied" }))
  if (info.turn >= 3) {
    return Effect.succeed(
      Policy.decision.continue({
        activeTools: ["submit_answer"],
        instructions: "Stop exploring. Submit your best answer now.",
      }),
    )
  }
  return Effect.succeed(Policy.decision.continue())
})
```

Under `Policy.both`, both policies must continue and the second policy's overrides win field by field.

## Recipe: a token-budget policy

Policies receive the full history each decision and may require Effect services. The policy's requirements remain visible in the Agent run type, and expected evaluation failures use Error. This pure budget recipe estimates the context size and stops with an explicit BudgetExhausted reason:

**token-budget.ts**

```typescript
import { Effect } from "effect"
import { Agent, Policy } from "generalist"
import { Prompt } from "effect/unstable/ai"

const approximateTokens = (history: Prompt.Prompt): number => Math.ceil(JSON.stringify(history.content).length / 4)

export const tokenBudget = (maxTokens: number): Policy.Policy =>
  Policy.make((info) =>
    Effect.succeed(
      approximateTokens(info.history) > maxTokens
        ? Policy.decision.stop({ _tag: "BudgetExhausted", budget: "tokens" })
        : Policy.decision.continue(),
    ),
  )

const _agent = Agent.make({
  name: "budgeted-researcher",
  policy: Policy.both(tokenBudget(24_000), Policy.recurs(8)),
})
```

<Note title="Budgets versus compaction">
A token-budget policy ends the run; compaction keeps it going by shrinking context. For long sessions, prefer [compaction](/guides/compaction) and keep the policy as a safety cap.
</Note>

## Next steps

- Shrink context instead of stopping: [How to stay inside the context window](/guides/compaction).
- Inject user input between turns: [How to steer and interrupt a running agent](/guides/steering).
