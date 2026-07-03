import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Schema, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import { Agent, Approvals, Memory, ModelMiddleware, ToolExecutor } from "../src/index"

type ModelParams = Parameters<typeof Ai.LanguageModel.make>[0]

const key: Memory.Key = { agent: "memory-agent", subject: "subject-1" }

const modelLayer = (streamText: ModelParams["streamText"]) =>
  Layer.effect(
    Ai.LanguageModel.LanguageModel,
    Ai.LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText,
    }),
  )

const textDelta = (delta: string) => Ai.Response.makePart("text-delta", { id: "text", delta })

const toolCallPart = (id: string, name: string, params: unknown) =>
  Ai.Response.makePart("tool-call", { id, name, params, providerExecuted: false })

const textPart = (text: string) => Ai.Prompt.makePart("text", { text })

const lookupTool = Ai.Tool.make("lookup", {
  description: "Lookup test memory fixture",
  parameters: Schema.Struct({}),
  success: Schema.Unknown,
})

const waitTool = Ai.Tool.make("wait", {
  description: "Suspending test memory fixture",
  parameters: Schema.Struct({}),
  success: Schema.Unknown,
})

const messageText = (message: Ai.Prompt.Message): string => {
  if (typeof message.content === "string") return message.content
  return message.content
    .filter((part): part is Ai.Prompt.TextPart => part.type === "text")
    .map((part) => part.text)
    .join("")
}

const unusedExecutor = ToolExecutor.testLayer({ execute: () => Effect.die("unexpected tool execution") })

describe("Memory", () => {
  it.effect("fails fast when memory options are set without a Memory service", () => {
    let modelCalls = 0
    const agent = Agent.make({ name: "memory-agent" })
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(Agent.generate(agent, { prompt: "hello", memory: { key } }))

      expect(failure._tag).toBe("@batonfx/core/AgentError")
      if (failure._tag === "@batonfx/core/AgentError") {
        expect(failure.message).toBe("RunOptions.memory requires Memory in context")
        expect(failure.turn).toBe(0)
      }
      expect(modelCalls).toBe(0)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() =>
            Stream.sync(() => {
              modelCalls += 1
              return textDelta("unexpected")
            }),
          ),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("inserts recalled items after system and before the run prompt before middleware", () => {
    let modelPrompt: Ai.Prompt.Prompt | undefined
    let middlewarePrompt: Ai.Prompt.Prompt | undefined
    const agent = Agent.make({ name: "memory-agent", instructions: "system instructions" })
    return Effect.gen(function* () {
      const result = yield* Agent.generate(agent, { prompt: "live prompt", memory: { key } })

      expect(result.text).toBe("done")
      expect(modelPrompt?.content.map(messageText)).toEqual([
        "system instructions",
        "remembered context",
        "live prompt",
      ])
      expect(middlewarePrompt?.content.map(messageText)).toEqual(["remembered context", "live prompt"])
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            modelPrompt = options.prompt
            return Stream.make(textDelta("done"))
          }),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.layer([
            {
              transformPrompt: (prompt) => {
                middlewarePrompt = prompt
                return Effect.succeed(prompt)
              },
            },
          ]),
          Memory.testLayer({
            recall: () => Effect.succeed([{ id: "item-1", parts: [textPart("remembered context")] }]),
            remember: () => Effect.void,
          }),
        ),
      ),
    )
  })

  it.effect("remembers each completed turn with terminal state", () => {
    const remembers: Array<Memory.RememberInput> = []
    let recalls = 0
    let calls = 0
    const agent = Agent.make({ name: "memory-agent", toolkit: Ai.Toolkit.make(lookupTool) })
    return Effect.gen(function* () {
      const result = yield* Agent.generate(agent, { prompt: "use a tool", memory: { key } })

      expect(result.text).toBe("done")
      expect(recalls).toBe(1)
      expect(remembers.map((input) => ({ turn: input.turn, terminal: input.terminal }))).toEqual([
        { turn: 0, terminal: false },
        { turn: 1, terminal: true },
      ])
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            const call = calls
            calls += 1
            return call === 0 ? Stream.make(toolCallPart("call-1", "lookup", {})) : Stream.make(textDelta("done"))
          }),
          ToolExecutor.testLayer({
            execute: () => Effect.succeed({ _tag: "Success", result: "ok", encodedResult: "ok" }),
          }),
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
          Memory.testLayer({
            recall: () =>
              Effect.sync(() => {
                recalls += 1
                return []
              }),
            remember: (input) => Effect.sync(() => remembers.push(input)).pipe(Effect.asVoid),
          }),
        ),
      ),
    )
  })

  it.effect("does not recall on resume", () => {
    let recalls = 0
    const agent = Agent.make({ name: "memory-agent", toolkit: Ai.Toolkit.make(lookupTool) })
    return Effect.gen(function* () {
      const result = yield* Agent.generate(agent, {
        prompt: "ignored on resume",
        memory: { key },
        resume: { call: { id: "call-resume", name: "lookup", params: {} } },
      })

      expect(result.text).toBe("done")
      expect(recalls).toBe(0)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => Stream.make(textDelta("done"))),
          ToolExecutor.testLayer({
            execute: () => Effect.succeed({ _tag: "Success", result: "ok", encodedResult: "ok" }),
          }),
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
          Memory.testLayer({
            recall: () =>
              Effect.sync(() => {
                recalls += 1
                return []
              }),
            remember: () => Effect.void,
          }),
        ),
      ),
    )
  })

  it.effect("does not remember a suspending run", () => {
    const remembers: Array<Memory.RememberInput> = []
    const agent = Agent.make({ name: "memory-agent", toolkit: Ai.Toolkit.make(waitTool) })
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(Stream.runDrain(Agent.stream(agent, { prompt: "wait", memory: { key } })))

      expect(failure._tag).toBe("@batonfx/core/AgentSuspended")
      expect(remembers).toEqual([])
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => Stream.make(toolCallPart("call-1", "wait", {}))),
          ToolExecutor.testLayer({ execute: () => Effect.succeed({ _tag: "Suspend", token: "wait-1" }) }),
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
          Memory.testLayer({
            recall: () => Effect.succeed([]),
            remember: (input) => Effect.sync(() => remembers.push(input)).pipe(Effect.asVoid),
          }),
        ),
      ),
    )
  })

  it.effect("maps MemoryError to AgentError", () => {
    let modelCalls = 0
    const memoryError = new Memory.MemoryError({ message: "memory unavailable" })
    const agent = Agent.make({ name: "memory-agent" })
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(Agent.generate(agent, { prompt: "hello", memory: { key } }))

      expect(failure._tag).toBe("@batonfx/core/AgentError")
      if (failure._tag === "@batonfx/core/AgentError") {
        expect(failure.message).toBe("memory unavailable")
        expect(failure.turn).toBe(0)
        expect(failure.cause).toBe(memoryError)
      }
      expect(modelCalls).toBe(0)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() =>
            Stream.sync(() => {
              modelCalls += 1
              return textDelta("unexpected")
            }),
          ),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
          Memory.testLayer({
            recall: () => Effect.fail(memoryError),
            remember: () => Effect.void,
          }),
        ),
      ),
    )
  })
})
