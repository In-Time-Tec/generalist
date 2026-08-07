import { expect, it } from "@effect/vitest"
import { Effect, Layer, Stream } from "effect"
import { Schema } from "effect"
import { LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, ExecutableManifest, ToolExecutor } from "@batonfx/core"
import { agentBudget } from "../src/execution-defaults.js"
import { Address, ExecutionHost, ExecutableResolver, Runtime, RunStore } from "../src/index.js"
import { closedTestAgent, pinnedTestAgent } from "./identity.js"
import { registrationsFor } from "./helpers.js"

const finish = (inputTokens: number) =>
  Response.makePart("finish", {
    reason: "stop",
    usage: Response.Usage.make({
      inputTokens: { total: inputTokens, uncached: inputTokens, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 100, text: 100, reasoning: undefined },
    }),
    response: undefined,
  })

it("runtime default budget does not impose a cumulative total-token cap", () => {
  expect((agentBudget as { readonly totalTokens?: number }).totalTokens).toBeUndefined()
  expect(agentBudget.modelCalls).toBeGreaterThan(0)
  expect(agentBudget.toolCalls).toBeGreaterThan(0)
  expect(agentBudget.childRuns).toBeGreaterThan(0)
})

it("a spawned child with default budget survives cumulative usage beyond one million tokens", () => {
  const noop = Tool.make("noop", {
    parameters: Schema.Struct({}),
    success: Schema.String,
  })
  const childAgent = Agent.make({ name: "child-heavy", toolkit: Toolkit.make(noop) })
  const childPinned = pinnedTestAgent(childAgent)
  const parentAgent = Agent.make({ name: "parent-heavy" })
  const parentPinned = pinnedTestAgent(parentAgent, "1", [{ selection: "child", agent: childPinned.pin }])
  const entries = [
    { _tag: "Agent" as const, ...parentPinned },
    { _tag: "Agent" as const, ...childPinned },
  ]
  const parentExecutable = ExecutableManifest.make({ root: parentPinned.pin, entries })
  const parentRef: ExecutableManifest.PinnedExecutable & ExecutableManifest.ExecutableRef = {
    ...parentExecutable,
    ...parentExecutable.ref,
  }
  const childExecutable = ExecutableManifest.make({ root: parentPinned.pin, active: childPinned.pin, entries })
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
    resolver: ExecutableResolver.makeStatic([
      { executable: parentRef, agent: closedTestAgent(parentAgent) },
      { executable: childRef, agent: Agent.close(childAgent, Layer.mergeAll(model, executor, handlers)) },
    ]),
    addresses: [{ address, executable: parentRef, registrations: registrationsFor(parentRef) }],
    scheduler: { pollInterval: "1 day" },
  })

  return Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const host = yield* ExecutionHost.ExecutionHost
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
    const completedFacts = snapshot.usage.filter((fact) => fact._tag === "Completed")
    expect(completedFacts).toHaveLength(4)
    expect(completedFacts.reduce((sum, fact) => sum + (fact.usage.inputTokens.total ?? 0), 0)).toBe(1_200_000)
  }).pipe(Effect.provide(runtimeLayer))
})
