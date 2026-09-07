import { expect, it } from "@effect/vitest"
import { Effect, Layer, Schema, Stream } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Agent, Hooks } from "../../../../src/index.js"
import { runEnd } from "../../../../src/core/agent/lifecycle/hooks.js"
import { DriverInterpreter, make as makeInterpreter } from "../../../../src/core/durable/driver/interpreter.js"
import { make as makeDriver, withPending } from "../../../../src/core/durable/loop-driver.js"
import { LoopDriverState } from "../../../../src/core/durable/loop-driver-state.js"
import { digest } from "../../../../src/core/durable/pin.js"
import { make as makeBudget } from "../../../../src/core/durable/run-budget.js"
import { encode as encodeHookInput } from "../../../../src/hooks/input.js"
import { ExecutableManifest } from "../../../../src/runtime/index.js"
import { TestModel } from "../../../../src/testing/index.js"
import { provideScoped } from "../../../runtime/execution/scoped-provide.js"

const fixture = Effect.fn("test.runEndContinuationFixture")(function* (complete: boolean) {
  const id = "terminal-hook-continuation"
  const agent = Agent.make({ name: id })
  const executable = ExecutableManifest.makeTest(id, undefined)
  let calls = 0
  const declaration = Hooks.onRunEnd({
    key: "terminal-hook",
    version: "1",
    replayPolicy: "never",
    hook: () =>
      Effect.sync(() => {
        calls += 1
        return Hooks.Continue()
      }),
  })
  const hooks = Hooks.make({ declarations: [declaration] })
  const input = {
    runId: id,
    agentName: agent.name,
    turns: 1,
    text: "first output",
    output: "first output",
    transcript: Prompt.make("first input"),
  }
  const driver = makeDriver({ logicalOperationId: id, sessionId: id, modelCallOrdinalStart: 1 })
  const initial = withPending(
    yield* driver.initial({ prompt: Prompt.make("first input"), executable: executable.ref, budget: makeBudget({}) }),
    {
      kind: "hook",
      key: `${id}:hook:${digest({ checkpoint: "hook:run:end", index: 0, declaration: declaration.key })}`,
      input: {
        chain: Hooks.chainPin([declaration]),
        event: "RunEnd",
        key: declaration.key,
        version: declaration.version,
        input: yield* encodeHookInput({ event: "RunEnd", value: input, outputSchema: Schema.String }),
      },
      replayPolicy: "never",
    },
    0,
  )
  const interpreter = yield* makeInterpreter({ driver, initial })
  yield* interpreter.recordHookDecisions({
    chain: Hooks.chainPin([declaration]),
    key: "hook:run:end",
    event: "RunEnd",
    decisions: [],
    complete: false,
  })
  if (complete) {
    yield* runEnd({ input, outputSchema: Schema.String }).pipe(
      Effect.provideService(DriverInterpreter, interpreter),
      Effect.provideService(Hooks.Hooks, hooks),
    )
  }
  const checkpoint = yield* interpreter.checkpoint
  const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(checkpoint.state)
  expect(state.pending).toMatchObject({ kind: "hook", input: { event: "RunEnd" } })
  expect(state.hooks).toMatchObject([{ key: "hook:run:end", event: "RunEnd", complete }])
  return { id, agent, executable, checkpoint, hooks, calls: () => calls }
})

it.effect("continues at a later explicit turn after a completed retained terminal hook", () =>
  Effect.gen(function* () {
    const state = yield* fixture(true)
    for (const turnStart of [undefined, 0, 1]) {
      const model = yield* TestModel.make([TestModel.text("continued output")])
      const options = {
        sessionId: state.id,
        logicalOperationId: state.id,
        executableRef: state.executable.ref,
        driverCheckpoint: state.checkpoint,
      }
      if (turnStart !== undefined) Object.assign(options, { turnStart })
      const events = yield* provideScoped(
        Layer.merge(model.layer, Layer.succeed(Hooks.Hooks, state.hooks)),
        Agent.stream(state.agent, "continue", options).pipe(Stream.runCollect),
      )
      const continuing = turnStart === 1
      expect(events.at(-1)).toMatchObject({
        _tag: "Completed",
        output: continuing ? "continued output" : "first output",
      })
      expect(yield* model.requests).toHaveLength(continuing ? 1 : 0)
      expect(events.filter((event) => event._tag === "TurnStarted")).toEqual(
        continuing ? [{ _tag: "TurnStarted", turn: 1 }] : [],
      )
      expect(state.calls()).toBe(1)
    }
  }),
)

it.effect("replays an unresolved terminal hook despite a later explicit turn", () =>
  Effect.gen(function* () {
    const state = yield* fixture(false)
    const model = yield* TestModel.make([TestModel.text("must not dispatch")])
    const events = yield* provideScoped(
      Layer.merge(model.layer, Layer.succeed(Hooks.Hooks, state.hooks)),
      Agent.stream(state.agent, "continue", {
        sessionId: state.id,
        logicalOperationId: state.id,
        executableRef: state.executable.ref,
        driverCheckpoint: state.checkpoint,
        turnStart: 1,
      }).pipe(Stream.runCollect),
    )
    expect(events.at(-1)).toMatchObject({ _tag: "Completed", output: "first output" })
    expect(yield* model.requests).toHaveLength(0)
    expect(state.calls()).toBe(1)
  }),
)
