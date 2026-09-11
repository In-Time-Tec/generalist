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
