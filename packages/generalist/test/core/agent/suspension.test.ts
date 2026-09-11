/* oxlint-disable effecttsgo/strict-effect-provide -- each test is a test-host Layer composition root. */
import { expect, it } from "@effect/vitest"
import { Effect, Layer, Schema, Stream } from "effect"
import { Prompt, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, AgentEvent, Approvals, Memory, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { TestModel } from "generalist/testing"

const echo = Tool.make("echo", {
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.String,
})

const gated = Tool.make("gated", {
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.String,
})

const script = [
  TestModel.turn([
    TestModel.toolCall("gated", { text: "a" }, { id: "gated-a" }),
    TestModel.toolCall("gated", { text: "b" }, { id: "gated-b" }),
  ]),
  TestModel.turn([TestModel.text("complete")]),
] as const

const toolResult = (suspension: AgentEvent.AgentSuspended, callId: string, result: string) => {
  const wait = suspension.waits.find((candidate) => candidate.call.id === callId)
  if (wait === undefined) throw new Error(`missing wait for ${callId}`)
  return { waitId: wait.waitId, resolution: { _tag: "ToolResult" as const, result, encodedResult: result } }
}

it.effect("suspends and resumes when a later turn reuses a completed tool-call id", () =>
  Effect.gen(function* () {
    let executions = 0
    let transcript: Prompt.Prompt | undefined
    const fixture = yield* TestModel.make([
      TestModel.turn([TestModel.toolCall("echo", { text: "same" }, { id: "reused-id" })]),
      TestModel.turn([TestModel.toolCall("echo", { text: "same" }, { id: "reused-id" })]),
      TestModel.turn([TestModel.text("complete")]),
    ])
    const toolkit = Toolkit.make(echo)
    const agent = Agent.make({ name: "reused-tool-call-id", toolkit })
    const layers = Layer.mergeAll(
      fixture.layer,
      toolkit.toLayer({ echo: () => Effect.die("configured ToolExecutor owns this call") }),
      ToolExecutor.layerTest({
        execute: () => {
          executions += 1
          return executions === 1
            ? Effect.succeed({ _tag: "Success" as const, result: "first", encodedResult: "first" })
            : Effect.succeed({ _tag: "Suspend" as const, token: "reused-token" })
        },
      }),
      Permissions.layerAllowAll,
      Approvals.layerAutoApprove,
      ModelMiddleware.layerIdentity,
      Memory.layerNoop,
    )

    const suspension = yield* Agent.stream(agent, "start").pipe(
      Stream.tap((event) =>
        Effect.sync(() => {
          if (event._tag === "TurnCompleted") transcript = event.transcript
        }),
      ),
      Stream.runDrain,
      Effect.flip,
      Effect.provide(layers),
    )

    expect(suspension._tag).toBe("generalist/core/AgentSuspended")
    if (suspension._tag !== "generalist/core/AgentSuspended" || transcript === undefined) {
      return yield* Effect.die("missing suspension for the reused tool-call id")
    }
    expect(suspension.waits.map((wait) => wait.call.id)).toEqual(["reused-id"])
    expect(suspension.waits[0]?.token).toBe("reused-token")
    expect(executions).toBe(2)

    const events = yield* Agent.stream(agent, "ignored", {
      history: transcript,
      resume: {
        suspension,
        resolutions: [toolResult(suspension, "reused-id", "resolved")],
      },
    }).pipe(Stream.runCollect, Effect.provide(layers))

    const completed = events.at(-1)
    expect(completed?._tag).toBe("Completed")
    if (completed?._tag !== "Completed") return yield* Effect.die("missing completion after resume")
    expect(completed.text).toBe("complete")
    expect(executions).toBe(2)
    expect((yield* fixture.requests).map((request) => request.operation)).toEqual([
      "streamText",
      "streamText",
      "streamText",
    ])
  }),
)

it.effect("fails typed when parallel approvals reuse one token", () =>
  Effect.gen(function* () {
    let executions = 0
    const fixture = yield* TestModel.make([...script])
    const toolkit = Toolkit.make(gated)
    const agent = Agent.make({
      name: "duplicate-approval-token",
      toolkit,
      toolScheduling: { maxConcurrency: 2, parallelSafe: ["gated"] },
    })
    const layers = Layer.mergeAll(
      fixture.layer,
      toolkit.toLayer({ gated: () => Effect.die("configured ToolExecutor owns this call") }),
      ToolExecutor.layerTest({
        execute: () => {
          executions += 1
          return Effect.succeed({ _tag: "Success" as const, result: "ran", encodedResult: "ran" })
        },
      }),
      Permissions.layerTest({
        evaluate: () => Effect.succeed({ _tag: "Ask" as const, token: "duplicate-token" }),
      }),
      Approvals.layerTest({ resolve: (pending) => Effect.succeed(pending) }),
      ModelMiddleware.layerIdentity,
    )

    const failure = yield* Agent.stream(agent, "start").pipe(Stream.runDrain, Effect.flip, Effect.provide(layers))

    expect(failure._tag).toBe("generalist/core/DuplicateWaitId")
    if (failure._tag !== "generalist/core/DuplicateWaitId") return yield* Effect.die("missing duplicate wait failure")
    expect(failure).toMatchObject({ waitId: "duplicate-token", firstIndex: 0, duplicateIndex: 1 })
    expect(executions).toBe(0)
    expect(yield* fixture.remaining).toBe(1)
  }),
)

it.effect("suspends two unique approval tokens and resumes exactly once per wait", () =>
  Effect.gen(function* () {
    const executions = new Map<string, number>()
    let transcript: Prompt.Prompt | undefined
    const fixture = yield* TestModel.make([...script])
    const toolkit = Toolkit.make(gated)
    const agent = Agent.make({
      name: "unique-approval-tokens",
      toolkit,
      toolScheduling: { maxConcurrency: 2, parallelSafe: ["gated"] },
    })
    const layers = Layer.mergeAll(
      fixture.layer,
      toolkit.toLayer({ gated: () => Effect.die("configured ToolExecutor owns this call") }),
      ToolExecutor.layerTest({
        execute: (request) => {
          executions.set(request.call.id, (executions.get(request.call.id) ?? 0) + 1)
          return Effect.succeed({ _tag: "Success" as const, result: request.call.id, encodedResult: request.call.id })
        },
      }),
      Permissions.layerTest({
        evaluate: (request) => Effect.succeed({ _tag: "Ask" as const, token: `token:${request.call.id}` }),
      }),
      Approvals.layerTest({ resolve: (pending) => Effect.succeed(pending) }),
      ModelMiddleware.layerIdentity,
    )

    const suspended = yield* Agent.stream(agent, "start").pipe(
      Stream.tap((event) =>
        Effect.sync(() => {
          if (event._tag === "TurnCompleted") transcript = event.transcript
        }),
      ),
      Stream.runDrain,
      Effect.flip,
      Effect.provide(layers),
    )

    expect(suspended._tag).toBe("generalist/core/AgentSuspended")
    if (suspended._tag !== "generalist/core/AgentSuspended" || transcript === undefined) {
      return yield* Effect.die("missing approval suspension")
    }
    expect(suspended.waits.map((wait) => [wait.waitId, wait.token, wait.call.id])).toEqual([
      ["token:gated-a", "token:gated-a", "gated-a"],
      ["token:gated-b", "token:gated-b", "gated-b"],
    ])
    expect(executions.size).toBe(0)

    const events = yield* Agent.stream(agent, "ignored", {
      history: transcript,
      resume: {
        suspension: suspended,
        resolutions: suspended.waits.map((wait) => ({
          waitId: wait.waitId,
          resolution: { _tag: "Approved" as const },
        })),
      },
    }).pipe(Stream.runCollect, Effect.provide(layers))

    expect(events.at(-1)?._tag).toBe("Completed")
    expect(executions).toEqual(
      new Map([
        ["gated-a", 1],
        ["gated-b", 1],
      ]),
    )
    expect(yield* fixture.remaining).toBe(0)
  }),
)
