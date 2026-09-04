---
title: "How to require human approval for a tool"
description: "Mark a tool needsApproval, decide with the Approvals service, catch AgentSuspended, and re-enter the run with RunOptions.resume."
---

To put a human between the model and a dangerous tool call, mark the tool `needsApproval` and provide an `Approvals` layer that answers for your host. When the answer cannot arrive in-process, the run suspends with a token and you re-enter it later. [Suspension as a typed error](/learn/suspension) explains the contract this guide exercises.

## 1. Mark the tool as needing approval

Set `needsApproval: true` on the tool. For call-dependent gating, pass a predicate `(params, context) => boolean` instead; it runs before every call to that tool.

**needs-approval-tool.ts**

```typescript
import { Schema } from "effect"
import { Agent } from "generalist"
import { Tool, Toolkit } from "effect/unstable/ai"

export const deployTool = Tool.make("deploy_service", {
  description: "Deploy a service to production",
  parameters: Schema.Struct({ service: Schema.String }),
  success: Schema.String,
  needsApproval: true,
})

const _agent = Agent.make({
  name: "release-agent",
  instructions: "Deploy services when asked, and wait for approval.",
  toolkit: Toolkit.make(deployTool),
})
```

## 2. Provide an Approvals layer

The loop asks `Approvals.resolve` before executing an ask-level or gated call. Answer with one of three resolutions: `Approved` executes the call, `Denied` returns a failed tool result to the model (with your `reason`), and `Pending` suspends the run with a token you mint:

**approvals-layer.ts**

```typescript
import { Effect, Layer } from "effect"
import { Approvals } from "generalist"

export const suspendForHumans: Layer.Layer<Approvals.Approvals> = Approvals.layerTest({
  resolve: (request) =>
    Effect.succeed<Approvals.Resolution>(
      request.call.name.startsWith("read_")
        ? { _tag: "Approved" }
        : { ...request, token: `approval:${request.call.id}` },
    ),
})
```

<Note title="Defaults">
Runs always have concrete defaults. Use `Approvals.layerAutoApprove` (the default) when nothing needs approval and `Approvals.layerDenyAll` for lockdown or tests.
</Note>

## 3. Catch AgentSuspended and resume

A `Pending` resolution fails the run with `AgentSuspended`, carrying the token plus the pending call's id, name, and params. Store those, resolve the approval out-of-band, then re-enter with `RunOptions.resume`. The resumed run executes the approved call first, then continues under the normal turn policy:

**suspend-and-resume.ts**

```typescript
import { Console, Effect, Layer, Schema, Stream } from "effect"
import { Agent, AgentEvent, Approvals, ModelMiddleware, Permissions } from "generalist"
import { LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"

const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})

const deployTool = Tool.make("deploy_service", {
  description: "Deploy a service to production",
  parameters: Schema.Struct({ service: Schema.String }),
  success: Schema.String,
  needsApproval: true,
})

const toolkit = Toolkit.make(deployTool)
const agent = Agent.make({ name: "release-agent", toolkit })

let calls = 0

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => {
      calls += 1
      return calls === 1
        ? Stream.make(
            Response.makePart("tool-call", {
              id: "deploy-1",
              name: "deploy_service",
              params: { service: "api" },
              providerExecuted: false,
            }),
            Response.makePart("finish", { reason: "tool-calls", usage, response: undefined }),
          )
        : Stream.make(
            Response.makePart("text-delta", { id: "assistant", delta: "api is deployed." }),
            Response.makePart("finish", { reason: "stop", usage, response: undefined }),
          )
    },
  }),
)

const toolkitLayer = toolkit.toLayer({
  deploy_service: ({ service }) => Effect.succeed(`deployed ${service}`),
})

const pendingLayers = Layer.mergeAll(
  modelLayer,
  toolkitLayer,
  Permissions.layerAllowAll,
  Approvals.layerTest({
    resolve: (request) => Effect.succeed({ ...request, token: `approval:${request.call.id}` }),
  }),
  ModelMiddleware.layerIdentity,
)

const approvedLayers = Layer.mergeAll(
  modelLayer,
  toolkitLayer,
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const prompt = "Deploy the api service."

const program = Effect.gen(function* () {
  let transcript = Prompt.empty
  const failure = yield* Effect.scoped(
    Effect.flatMap(Layer.build(pendingLayers), (services) =>
      Agent.stream(agent, prompt).pipe(
        Stream.runForEach((event) =>
          Effect.sync(() => {
            if (event._tag === "TurnCompleted") transcript = event.transcript
          }),
        ),
        Effect.provideContext(services),
      ),
    ),
  ).pipe(Effect.flip)
  if (!Schema.is(AgentEvent.AgentSuspended)(failure)) {
    return yield* Effect.die("expected the run to suspend")
  }
  const [wait] = failure.waits
  if (wait === undefined) {
    return yield* Effect.die("expected an approval wait")
  }
  yield* Console.log(`suspended reason=${wait.reason} tool=${wait.call.name} token=${wait.token}`)
  const resumed = yield* Effect.scoped(
    Effect.flatMap(Layer.build(approvedLayers), (services) =>
      Agent.run(agent, prompt, {
        history: transcript,
        resume: {
          suspension: failure,
          resolutions: [{ waitId: wait.waitId, resolution: { _tag: "Approved" } }],
        },
      }).pipe(Effect.provideContext(services)),
    ),
  )
  yield* Console.log(resumed)
})

await Effect.runPromise(program)
```

**Output**

```text
suspended reason=approval tool=deploy_service token=approval:deploy-1
api is deployed.
```

Gates are consulted again on re-entry, so the resumed run must carry an `Approvals` layer that now answers `Approved` (in a real host, from the stored approval record for that token).

## 4. Move the decision over the wire

In a served agent, the suspension travels to the client as a `Suspended` frame and the client answers with `ResolveApproval`: the token round-trips, and the registry resumes the run for you. [How to serve an agent over SSE and WebSocket](/guides/serve-transport) wires it; [How to build a chat UI with FoldKit](/guides/foldkit-chat) renders the approve and deny buttons.

## Next steps

- Decide by pattern before the approval gate: [How to gate tools with permission rules](/guides/permissions).
- Understand the token and re-entry contract: [Suspension as a typed error](/learn/suspension).
