---
title: "Suspension as a typed error"
description: "AgentSuspended on the error channel is the human-in-the-loop contract: the host stores a token and re-enters the run with RunOptions.resume."
---

Suspension is not failure handling. It is the human-in-the-loop contract: a typed statement that the run did not finish and must be re-entered once someone (a person, an external system, a durable runtime) resolves a token out-of-band. Generalist puts that statement on the stream's error channel as `AgentSuspended`.

## A typed error with a deliberate shape

The error carries five fields:

| Field          | Meaning                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| `token`        | Opaque handle the host resolves out-of-band                                                               |
| `reason`       | `"approval"` from an Approvals `Pending` decision, or `"tool-wait"` from a ToolExecutor `Suspend` outcome |
| `tool_call_id` | Id of the pending tool call                                                                               |
| `tool_name`    | Name of the pending tool                                                                                  |
| `tool_params`  | Params of the pending tool call                                                                           |

There are exactly two producers. `Approvals.resolve` returning `Pending` suspends a `needsApproval` tool before it executes; `ToolExecutor.execute` returning `Suspend` parks a call whose result will arrive later. A [permission rule](/guides/permissions) that asks and gets no in-process answer suspends through the same `"approval"` path.

## Suspend, resolve, resume

The host's job is three steps: catch `AgentSuspended`, store the token and the transcript, and later re-enter the run with `RunOptions.resume` carrying the pending call. This run suspends on an approval and resumes to completion, with zero credentials:

**suspend-and-resume.ts**

```typescript
import { Console, Effect, Layer, ManagedRuntime, Schema, Stream } from "effect"
import { Agent, AgentEvent, Approvals, ModelMiddleware, Permissions } from "generalist"
import { Prompt, Tool, Toolkit } from "effect/unstable/ai"
import { TestModel } from "generalist/testing"

const deployTool = Tool.make("deploy", {
  description: "Deploy a service to production",
  parameters: Schema.Struct({ service: Schema.String }),
  success: Schema.String,
  needsApproval: true,
})

const toolkit = Toolkit.make(deployTool)

const agent = Agent.make({
  name: "release-agent",
  instructions: "Deploy what the user asks for.",
  toolkit,
})

const modelLayer = TestModel.layer([
  TestModel.toolCall("deploy", { service: "api" }, { id: "deploy-1" }),
  TestModel.text("The api service is deployed."),
])

let approvalChecks = 0

const layers = Layer.mergeAll(
  modelLayer,
  toolkit.toLayer({ deploy: () => Effect.succeed("deployed api") }),
  Permissions.layerAllowAll,
  Approvals.layerTest({
    resolve: (pending) => {
      approvalChecks += 1
      return Effect.succeed<Approvals.Resolution>(
        approvalChecks === 1 ? { ...pending, token: "approval-deploy-1" } : { _tag: "Approved" },
      )
    },
  }),
  ModelMiddleware.layerIdentity,
)

let transcript: Prompt.Prompt = Prompt.empty

const program = Effect.gen(function* () {
  const suspension = yield* Agent.stream(agent, "Deploy the api service.").pipe(
    Stream.runForEach((event) =>
      Effect.sync(() => {
        if (event._tag === "TurnCompleted") transcript = event.transcript
      }),
    ),
    Effect.flatMap(() => Effect.die("expected the run to suspend")),
    Effect.catchIf(
      (error): error is AgentEvent.AgentSuspended => Schema.is(AgentEvent.AgentSuspended)(error),
      (error) => Effect.succeed(error),
    ),
  )
  const [wait] = suspension.waits
  if (wait === undefined) {
    return yield* Effect.die("expected an approval wait")
  }
  yield* Console.log(`suspended reason=${wait.reason} tool=${wait.call.name} token=${wait.token}`)
  const result = yield* Agent.run(agent, "", {
    history: transcript,
    resume: {
      suspension,
      resolutions: [{ waitId: wait.waitId, resolution: { _tag: "Approved" } }],
    },
  })
  yield* Console.log(result)
})

const runtime = ManagedRuntime.make(layers)
await runtime.runPromise(program)
```

**Output**

```text
suspended reason=approval tool=deploy token=approval-deploy-1
The api service is deployed.
```

Three details of the re-entry contract are visible here. First, just before failing, the stream emits a trailing `TurnCompleted` whose transcript includes the suspending turn; that is what the snippet stores and passes back as `history`. Second, the resumed run executes the pending call first, before any model call, then re-feeds its result and continues under the normal turn policy. Third, gates are consulted again on re-entry: the `Approvals` layer answers `Approved` the second time because the host has resolved the token, which is exactly how a real host answers from its own approval record.

## Why the shape mirrors a tool call

The field shape (id, name, params) is deliberately the shape of a tool call, because that is what a durable host must persist to re-enter later. Store those three fields plus the token and the transcript, and a resume days later reconstructs the exact call identity the model emitted. generalist/runtime persists that suspension as a durable Run wait and applies its resolution to the authoritative core suspension on re-entry; see [where durability lives](/learn/native-runtime). generalist defines the suspension contract but does not persist it.

## Why an error and not a callback

A callback-based pause lives outside the type system: nothing forces you to handle it, and it composes poorly with scopes and interruption. A typed error on the `RunError` channel composes with everything Effect already gives you: `catchIf` and `catchTag`, scoped resource cleanup on the way out, interruption, and retry combinators. A suspension tears the run down cleanly through ordinary error propagation, which is what makes it safe to resume from a different process entirely. For approvals over a live connection, where the wire carries the token to a browser and back, see [How to require human approval](/guides/approvals) and [How to serve an agent over SSE and WebSocket](/guides/serve-transport).
