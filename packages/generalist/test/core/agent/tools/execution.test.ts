/* oxlint-disable effecttsgo/strict-effect-provide -- each test is a test-host Layer composition root. */
import { expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Schema, Stream } from "effect"
import { Prompt, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, ToolExecutor, ToolOutput } from "../../../../src/index.js"
import { TestModel } from "../../../../src/testing/index.js"
import { allowAllAuthorization } from "../../../authorization.js"
import { Json } from "../../json.js"

const parameters = Schema.Struct({})
const waitTool = Tool.make("wait", { parameters, success: Schema.String })
const waitToolkit = Toolkit.make(waitTool)
const waitHandlers = waitToolkit.toLayer({ wait: () => Effect.die("ToolExecutor owns this call") })

const BoundedOutput = Schema.Struct({
  inline: Schema.Struct({
    truncated: Schema.Literal(true),
    bytes: Schema.Finite,
    maxBytes: Schema.Finite,
    digest: Schema.String,
    preview: Schema.String,
  }),
  outputPaths: Schema.Array(Schema.String),
})

interface Put {
  readonly toolCallId: string
  readonly content: unknown
}

/**
 * Suspend one tool-wait, then resolve it through `RunOptions.resume`. The host
 * resolution must pass through the same output bound and spill protocol as an
 * executed call.
 */
const observeResume = (input: {
  readonly payload: string
  readonly resolution: "ToolResult" | "Signal"
  readonly toolOutputMaxBytes?: number
  readonly store?: boolean
}) =>
  Effect.gen(function* () {
    const puts: Array<Put> = []
    const fixture = yield* TestModel.make([TestModel.toolCall("wait", {}, { id: "wait-1" }), TestModel.text("done")])
    const agent = Agent.make({ name: `resume-output-bound-${input.resolution}`, toolkit: waitToolkit })
    const executor = ToolExecutor.layerTest({
      execute: () => Effect.succeed({ _tag: "Suspend" as const, token: "wait-token" }),
    })
    const store =
      input.store === false
        ? Layer.empty
        : ToolOutput.layerTest({
            put: (toolCallId, content) => {
              puts.push({ toolCallId, content })
              return Effect.succeed(Option.some(`mem:${puts.length}`))
            },
          })
    const services = Layer.mergeAll(fixture.layer, allowAllAuthorization, waitHandlers, executor, store)
    const options = input.toolOutputMaxBytes === undefined ? {} : { toolOutputMaxBytes: input.toolOutputMaxBytes }
    let transcript: Prompt.Prompt | undefined

    const suspension = yield* Agent.stream(agent, "go", options).pipe(
      Stream.tap((event) =>
        Effect.sync(() => {
          if (event._tag === "TurnCompleted") transcript = event.transcript
        }),
      ),
      Stream.runDrain,
      Effect.flip,
      Effect.provide(services),
    )
    if (suspension._tag !== "generalist/core/AgentSuspended" || transcript === undefined) {
      return yield* Effect.die(`tool wait did not suspend: ${suspension._tag}`)
    }
    const wait = suspension.waits[0]!
    const resolution =
      input.resolution === "Signal"
        ? { _tag: "Signal" as const, name: wait.waitId, payload: input.payload }
        : { _tag: "ToolResult" as const, result: input.payload, encodedResult: input.payload }

    const events = yield* Agent.stream(agent, "ignored", {
      history: transcript,
      resume: { suspension, resolutions: [{ waitId: wait.waitId, resolution }] },
      ...options,
    }).pipe(Stream.runCollect, Effect.provide(services))
    const completed = events.find(
      (event): event is Extract<(typeof events)[number], { readonly _tag: "ToolExecutionCompleted" }> =>
        event._tag === "ToolExecutionCompleted",
    )
    return {
      completed: completed === undefined ? undefined : completed.result,
      puts,
      prompts: yield* fixture.prompts,
    }
  })

it.effect("bounds a resumed ToolResult resolution and spills the full payload once", () => {
  const payload = "z".repeat(100)
  return Effect.gen(function* () {
    const observed = yield* observeResume({ payload, resolution: "ToolResult", toolOutputMaxBytes: 16 })

    const bounded = Option.getOrThrow(Schema.decodeUnknownOption(BoundedOutput)(observed.completed?.result))
    expect(bounded.inline.truncated).toBe(true)
    expect(bounded.inline.bytes).toBe(102)
    expect(bounded.inline.maxBytes).toBe(16)
    expect(bounded.inline.preview).toBe(`"${"z".repeat(15)}`)
    expect(bounded.inline.digest).toMatch(/^[0-9a-f]{64}$/)
    expect(bounded.outputPaths).toEqual(["mem:1"])
    expect(observed.puts).toEqual([{ toolCallId: "wait-1", content: { result: payload, encodedResult: payload } }])

    const resumedPrompt = Json.stringify(observed.prompts[1])
    expect(resumedPrompt).toContain(`"${"z".repeat(15)}`)
    expect(resumedPrompt).not.toContain(payload)
  })
})

it.effect("bounds a resumed Signal resolution named by the wait ID", () => {
  const payload = "z".repeat(100)
  return Effect.gen(function* () {
    const observed = yield* observeResume({ payload, resolution: "Signal", toolOutputMaxBytes: 16 })

    expect(observed.completed?.result).toMatchObject({
      inline: { truncated: true, bytes: 102, maxBytes: 16, preview: `"${"z".repeat(15)}` },
      outputPaths: ["mem:1"],
    })
    expect(observed.puts).toEqual([{ toolCallId: "wait-1", content: { result: payload, encodedResult: payload } }])
    expect(Json.stringify(observed.prompts[1])).not.toContain(payload)
  })
})

it.effect("applies the 50 KiB default when toolOutputMaxBytes is absent", () => {
  const payload = "z".repeat(60 * 1024)
  return Effect.gen(function* () {
    const observed = yield* observeResume({ payload, resolution: "ToolResult" })

    expect(observed.completed?.result).toMatchObject({
      inline: { truncated: true, bytes: 60 * 1024 + 2, maxBytes: 50 * 1024 },
      outputPaths: ["mem:1"],
    })
    expect(observed.puts).toHaveLength(1)
    const resumedPrompt = Json.stringify(observed.prompts[1])
    expect(resumedPrompt).not.toContain(payload)
    expect(resumedPrompt).toContain("z".repeat(50 * 1024 - 1))
  })
})

it.effect("bounds the resolved value inline when no ToolOutput store is available", () => {
  const payload = "z".repeat(100)
  return Effect.gen(function* () {
    const observed = yield* observeResume({
      payload,
      resolution: "ToolResult",
      toolOutputMaxBytes: 16,
      store: false,
    })

    expect(observed.completed?.result).toMatchObject({
      inline: { truncated: true, bytes: 102, maxBytes: 16, preview: `"${"z".repeat(15)}` },
      outputPaths: [],
    })
    expect(observed.puts).toEqual([])
  })
})

it.effect("leaves a resolved payload at or below the bound untouched without spilling", () => {
  const payload = "z".repeat(8)
  return Effect.gen(function* () {
    const observed = yield* observeResume({ payload, resolution: "ToolResult", toolOutputMaxBytes: 16 })

    expect(observed.completed?.result).toBe(payload)
    expect(observed.puts).toEqual([])
  })
})
