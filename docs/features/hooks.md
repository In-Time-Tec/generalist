---
title: "Lifecycle hooks"
description: "Pin ordered lifecycle declarations and recover recorded decisions without unsafe replay."
---

`Hooks` is the ordered Effect service for intercepting Agent lifecycle boundaries. The same Layer works for process-local Agents and durable Runtime executions. Hooks can observe a boundary, stop it, or replace the event-specific value without introducing a second event or persistence system.

## Usage

```ts
import { Effect } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Hooks } from "generalist"

const lifecycle = Hooks.layer([
  Hooks.onToolCall({
    key: "block-destructive-command",
    version: "1",
    replayPolicy: "pure",
    hook: ({ tool, args }) =>
      tool === "bash" && String(args).includes("rm -rf")
        ? Effect.succeed(Hooks.Block({ reason: "destructive" }))
        : Effect.succeed(Hooks.Continue()),
  }),
  Hooks.onCompaction({
    key: "retain-release-constraints",
    version: "1",
    replayPolicy: "pure",
    hook: () => Effect.succeed(Hooks.AddContext(Prompt.make("Retain the release constraints."))),
  }),
])
```

Provide the Layer at the Agent run or Runtime registration boundary. Every declaration requires a stable nonempty `key`, `version`, and `replayPolicy` (`pure`, `provider-idempotent`, or `never`). Keys must be unique within the chain. Omitting `Hooks`, or providing `Hooks.layerIdentity`, is an empty chain. The string check above illustrates a hook decision; it is not a secure shell policy or sandbox.

## Events and decisions

| Event             | Mutable value                        | Allowed decisions                            |
| ----------------- | ------------------------------------ | -------------------------------------------- |
| `RunStart`        | initial prompt                       | `Continue`, `Block`, `Replace`, `AddContext` |
| `TurnStart`       | turn prompt                          | `Continue`, `Block`, `Replace`, `AddContext` |
| `ModelCall`       | middleware-transformed prompt        | `Continue`, `Block`, `Replace`, `AddContext` |
| `ToolCall`        | arguments                            | `Continue`, `Block`, `Replace`, `Ask`        |
| `ToolResult`      | success or domain-failure value      | `Continue`, `Block`, `Replace`               |
| `ApprovalRequest` | approval request                     | `Continue`, `Block`                          |
| `Compaction`      | prompt entering compaction           | `Continue`, `Block`, `Replace`, `AddContext` |
| `ChildStart`      | child identity                       | `Continue`, `Block`                          |
| `ChildEnd`        | child result                         | `Continue`, `Block`, `Replace`               |
| `Steer`           | drained steering or follow-up prompt | `Continue`, `Block`, `Replace`, `AddContext` |
| `RunEnd`          | terminal output                      | `Continue`, `Block`, `Replace`               |

Returning `void` is shorthand for `Continue`. `Replace` changes only the mutable value in the table: for example, a `ToolCall` replacement changes its arguments while retaining the model-authored tool name and call ID. `AddContext` appends a Prompt. `Ask` forces the ordinary Tool authorization boundary to use its configured Approvals path; a durable `Pending` result suspends and resumes through the existing approval token.

## Ordering and replay

Declarations run in registration order. The ordered identities and event names form a pinned chain; recovery rejects a different chain rather than substituting current configuration. Each declaration sees replacements and added context from earlier declarations. `Block` records its reason and skips every later declaration for that event.

With a durable driver, each returned decision is appended to `LoopDriverState` through the existing checkpoint journal before the next declaration runs. Recovery applies the recorded decision prefix; a completed chain, including a recorded `Block`, does not invoke its hooks again. Tool replacements retain the model-authored call separately from the effective call so approval suspension can validate the original transcript and resume the replaced arguments.

Each hook also has a durable operation intent and outcome. The callback's second argument supplies a stable `operationKey` for provider idempotency. A `never` hook whose dispatch outcome is uncertain is fenced as unknown; reconstruction must not call it again. `pure` is a promise that repetition has no external effect, and `provider-idempotent` requires a real provider deduplication contract. A version label alone cannot make an effect safe to repeat.

Completion gates run before `onRunEnd`. A rejected completion therefore does not invoke the terminal hook. Once every gate passes, `onRunEnd` remains the boundary immediately before `Completed`; its trusted replacement becomes the final output without re-running the gates.

Replacement values cross the durable checkpoint boundary. Durable applications should therefore return values accepted by their event's public Schema and by the host's serialized checkpoint format.

## Model middleware

`onModelCall` is the final prompt entry in the `ModelMiddleware` chain. Configured middleware runs first in its declared order; the ModelCall hook then sees that authoritative transformed prompt. Response-part transforms remain exclusively owned by `ModelMiddleware`.

## Failure paths

```text
hook returns Block
├── prompt/run/child boundary -> typed Agent failure or child domain failure
└── tool boundary             -> tool failure visible to the next model turn

hook Effect fails
└── HookFailed { event, cause, hint } -> Run failure
```

Hook defects and typed failures are both captured as `HookFailed`; interruption remains interruption. Hook failures are never converted into tool or child domain data. A durable Run records `HookFailed` verbatim as its terminal `RunFailed` failure, and a prompt replacement the boundary rejects is never checkpointed as a complete decision.

## Host plugins

`Host.plugin({ hooks })` accepts the same declaration values. Ambient Hooks declarations run first, followed by plugin declarations in plugin order. The Host captures that merged service when it registers each configured Agent; Runtime recovery therefore uses the same hook chain.

## Invariants

- Hook state is part of the existing driver checkpoint and operation journal; there is no hook store or event journal.
- A recorded `onRunEnd` outcome is reused after ordered gate decisions and before `Completed`; uncertain external effects still obey the declared replay policy.
- Run, turn, model, compaction, steering, and terminal replacements remain inside the Agent's existing Prompt and output contracts.
- A blocked ToolCall does not authorize or dispatch its handler. Its journaled domain failure still enters the authoritative tool result and next model prompt.
- Process-local `AgentTool` children and Runtime singleton or grouped children use `ChildStart` and `ChildEnd` from the same Hooks service.
- Custom `ToolAuthorization.Authorizer` implementations must honor `Request.forceApproval` by using their Approvals authority; Generalist's default authorizer does so.

## Related

- Recovery tests: [`core/agent/lifecycle/hooks.test.ts`](https://github.com/In-Time-Tec/generalist/blob/main/packages/generalist/test/core/agent/lifecycle/hooks.test.ts)
- Source: `packages/generalist/src/hooks/index.ts`, `packages/generalist/src/core/agent/lifecycle/hooks.ts`
- Sibling feature docs: [`middleware.md`](./middleware.md), [`approvals.md`](./approvals.md), [`host.md`](./host.md), [`agent-loop.md`](./agent-loop.md)
