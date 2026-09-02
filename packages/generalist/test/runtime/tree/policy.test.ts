import { expect, it } from "@effect/vitest"
import { Effect, Layer, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, ExecutableManifest, RunBudget, ToolExecutor } from "../../../src/index.js"
import { Address, RunExecutor, ExecutableResolver, Runtime, RunStore } from "../../../src/runtime/index.js"
import { defaultTreePolicy, TREE_POLICY_MAX } from "../../../src/runtime/tree/policy.js"
import { closedTestAgent, pinnedTestAgent } from "../run/identity.js"
import { registrationsFor } from "../execution/fixtures.js"
import { allowAllAuthorization } from "../../authorization.js"

const scopedWith =
  <A, E>(layerValue: Layer.Layer<A, E, never>) =>
  <B, E2, R2 extends A | import("effect").Scope.Scope>(effect: Effect.Effect<B, E2, R2>) =>
    Effect.scoped(Effect.flatMap(Layer.build(layerValue), (context) => effect.pipe(Effect.provideContext(context))))

const finish = (inputTokens: number) =>
  Response.makePart("finish", {
    reason: "stop",
    usage: Response.Usage.make({
      inputTokens: { total: inputTokens, uncached: inputTokens, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 100, text: 100, reasoning: undefined },
    }),
    response: undefined,
  })

it("an unspecified agent budget is unbounded rather than a runtime-invented ceiling", () => {
  expect(RunBudget.unbounded).toEqual({})
  for (const dimension of ["modelCalls", "toolCalls", "totalTokens", "childRuns", "handoffs", "depth", "deadline"])
    expect(dimension in RunBudget.unbounded).toBe(false)
})

it("an unspecified tree policy admits recursion up to the schema ceiling instead of a smaller default", () => {
  expect(defaultTreePolicy).toEqual({ maxDepth: TREE_POLICY_MAX, maxSubagents: TREE_POLICY_MAX })
})

it.effect("a spawned child with no budget survives cumulative usage beyond one million tokens", () => {
  const noop = Tool.make("noop", {
    parameters: Schema.Struct({}),
    success: Schema.String,
  })
  const childAgent = Agent.make({
    name: "child-heavy",
    toolkit: Toolkit.make(noop),
  })
  const childPinned = pinnedTestAgent(childAgent)
  const parentAgent = Agent.make({ name: "parent-heavy" })
  const parentPinned = pinnedTestAgent(parentAgent, "1", [{ selection: "child" }])
  const entries = [
    { _tag: "Agent" as const, ...parentPinned },
    { _tag: "Agent" as const, ...childPinned },
  ]
  const profiles = [{ selection: "child", agent: childPinned.pin }]
  const parentExecutable = ExecutableManifest.make({ root: parentPinned.pin, profiles, entries })
  const parentRef: ExecutableManifest.PinnedExecutable & ExecutableManifest.ExecutableRef = {
    ...parentExecutable,
    ...parentExecutable.ref,
  }
  const childExecutable = ExecutableManifest.make({
    root: parentPinned.pin,
    active: childPinned.pin,
    profiles,
    entries,
  })
  const childRef: ExecutableManifest.PinnedExecutable & ExecutableManifest.ExecutableRef = {
    ...childExecutable,
    ...childExecutable.ref,
  }
  const address = Address.make("agent:parent-heavy")
  let modelCalls = 0
  const model = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: () => {
        modelCalls += 1
        return Stream.fromIterable<Response.StreamPartEncoded>(
          modelCalls < 4
            ? [
                Response.makePart("tool-call", {
                  id: `noop-${modelCalls}`,
                  name: "noop",
                  params: {},
                  providerExecuted: false,
                }),
                finish(300_000),
              ]
            : [Response.makePart("text-delta", { id: "answer", delta: "done" }), finish(300_000)],
        )
      },
    }),
  )
  const executor = ToolExecutor.layerTest({
    execute: (request: ToolExecutor.Request) =>
      request.call.name === "noop"
        ? Effect.succeed({ _tag: "Success", result: "ok", encodedResult: "ok" })
        : Effect.fail(
            ToolExecutor.FrameworkFailure.make({
              stage: "handler",
              tool: request.call.name,
              message: "unexpected tool",
            }),
          ),
  })
  const handlers = Toolkit.make(noop).toLayer({ noop: () => Effect.die("ToolExecutor test layer owns execution") })
  const runtimeLayer = Runtime.layerMemory({
    addresses: [{ address, executable: parentRef, registrations: registrationsFor(parentRef) }],
    scheduler: { pollInterval: "1 day" },
  }).pipe(
    Layer.provide(
      ExecutableResolver.layerStatic([
        { executable: parentRef, agent: closedTestAgent(parentAgent) },
        {
          executable: childRef,
          agent: Agent.close(childAgent, Layer.mergeAll(allowAllAuthorization, model, executor, handlers)),
        },
      ]).pipe(Layer.orDie),
    ),
  )

  return Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const host = yield* RunExecutor.RunExecutor
    const store = yield* RunStore.RunStore
    const parentReceipt = yield* runtime.send({
      to: address,
      sessionId: "thread:heavy",
      idempotencyKey: "heavy-parent",
      prompt: Prompt.make("spawn"),
    })
    const child = yield* runtime.spawn({
      parentRunId: parentReceipt.runId,
      invocationId: "invocation:heavy",
      selection: "child",
      prompt: Prompt.make("heavy work"),
    })
    yield* host.execute(yield* store.claimExecution({ runId: child.runId, ownerId: "heavy" }))
    const inspection = yield* runtime.inspect(child.runId)
    expect(modelCalls).toBe(4)
    expect(inspection.status).toBe("succeeded")
    const snapshot = yield* runtime.snapshot(child.runId)
    const completedFacts = snapshot.usageFacts.filter((fact) => fact._tag === "Completed")
    expect(completedFacts).toHaveLength(4)
    expect(completedFacts.reduce((sum, fact) => sum + (fact.usage.inputTokens.total ?? 0), 0)).toBe(1_200_000)
  }).pipe(scopedWith(runtimeLayer))
})
