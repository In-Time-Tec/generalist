import { expect, layer } from "@effect/vitest"
import { Effect, Layer, Option, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { expectTypeOf } from "vitest"
import { Agent, Approvals, Memory, ModelMiddleware, ToolExecutor } from "../src/index"
import { unusedToolHandlerLayer } from "./tool-handler-layer"
import { ItLayer } from "./it-layer"

type ModelParams = Parameters<typeof LanguageModel.make>[0]

const key: Memory.Key = { agent: "memory-agent", subject: "subject-1" }

const modelLayer = (streamText: ModelParams["streamText"]) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText,
    }),
  )

const textDelta = (delta: string) => Response.makePart("text-delta", { id: "text", delta })

const toolCallPart = (id: string, name: string, params: unknown) =>
  Response.makePart("tool-call", { id, name, params, providerExecuted: false })

const textPart = (text: string) => Prompt.makePart("text", { text })

const lookupTool = Tool.make("lookup", {
  description: "Lookup test memory fixture",
  parameters: Schema.Struct({}),
  success: Schema.Unknown,
})

const waitTool = Tool.make("wait", {
  description: "Suspending test memory fixture",
  parameters: Schema.Struct({}),
  success: Schema.Unknown,
})

const messageText = (message: Prompt.Message): string => {
  if (typeof message.content === "string") return message.content
  return message.content
    .filter((part): part is Prompt.TextPart => part.type === "text")
    .map((part) => part.text)
    .join("")
}

const unusedExecutor = ToolExecutor.testLayer({ execute: () => Effect.die("unexpected tool execution") })

layer(unusedToolHandlerLayer)("Memory", (it) => {
  it("accepts only user-message parts as recalled item content", () => {
    expectTypeOf<Memory.ItemPart>().toEqualTypeOf<Prompt.UserMessagePart>()
    expectTypeOf<Prompt.ReasoningPart>().not.toExtend<Memory.ItemPart>()
    expectTypeOf<Prompt.ToolCallPart>().not.toExtend<Memory.ItemPart>()
    expectTypeOf<Prompt.ToolResultPart>().not.toExtend<Memory.ItemPart>()
    expectTypeOf<Prompt.ToolApprovalResponsePart>().not.toExtend<Memory.ItemPart>()
    expectTypeOf<Prompt.ToolApprovalRequestPart>().not.toExtend<Memory.ItemPart>()
    expectTypeOf<Memory.Item["content"]>().toEqualTypeOf<ReadonlyArray<Memory.ItemPart>>()
  })

  it("converts legacy prompt parts without reinterpreting protocol parts", () => {
    const text = textPart("remembered context")
    const file = Prompt.makePart("file", {
      mediaType: "text/plain",
      fileName: "memory.txt",
      data: new Uint8Array([1, 2, 3]),
    })
    const protocolParts: ReadonlyArray<Prompt.Part> = [
      Prompt.makePart("reasoning", { text: "private reasoning" }),
      Prompt.makePart("tool-call", {
        id: "call-1",
        name: "lookup",
        params: {},
        providerExecuted: false,
      }),
      Prompt.makePart("tool-result", {
        id: "call-1",
        name: "lookup",
        isFailure: false,
        result: "result",
      }),
      Prompt.makePart("tool-approval-response", { approvalId: "approval-1", approved: true }),
      Prompt.makePart("tool-approval-request", { approvalId: "approval-1", toolCallId: "call-1" }),
    ]

    expect(Memory.itemFromPromptPart(text)).toEqual(Option.some(text))
    expect(Memory.itemFromPromptPart(file)).toEqual(Option.some(file))
    expect(protocolParts.map(Memory.itemFromPromptPart)).toEqual(protocolParts.map(() => Option.none()))
  })

  ItLayer.make(it, "fails fast when memory options are set without a Memory service", () => {
    let modelCalls = 0
    const agent = Agent.make({ name: "memory-agent" })
    return [
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
      Effect.gen(function* () {
        const failure = yield* Effect.flip(Agent.generate(agent, { prompt: "hello", memory: { key } }))

        expect(failure._tag).toBe("@batonfx/core/AgentError")
        if (failure._tag === "@batonfx/core/AgentError") {
          expect(failure.message).toBe("RunOptions.memory requires Memory in context")
          expect(failure.turn).toBe(0)
        }
        expect(modelCalls).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(it, "inserts text and file content from multiple recalled items in source order", () => {
    let modelPrompt: Prompt.Prompt | undefined
    let middlewarePrompt: Prompt.Prompt | undefined
    const file = Prompt.makePart("file", {
      mediaType: "text/plain",
      fileName: "memory.txt",
      data: new Uint8Array([1, 2, 3]),
    })
    const agent = Agent.make({ name: "memory-agent", instructions: "system instructions" })
    return [
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
          recall: () =>
            Effect.succeed([
              { id: "item-empty", content: [] },
              { id: "item-text", content: [textPart("remembered context")] },
              { id: "item-file", content: [file] },
            ]),
          remember: () => Effect.void,
          forget: () => Effect.void,
        }),
      ),
      Effect.gen(function* () {
        const result = yield* Agent.generate(agent, { prompt: "live prompt", memory: { key } })

        expect(result.text).toBe("done")
        expect(modelPrompt?.content.map(messageText)).toEqual([
          "system instructions",
          "remembered context",
          "live prompt",
        ])
        expect(middlewarePrompt?.content.map(messageText)).toEqual(["remembered context", "live prompt"])
        const recalledMessage = modelPrompt?.content[1]
        expect(recalledMessage?.role).toBe("user")
        expect(recalledMessage?.content).toEqual([textPart("remembered context"), file])
      }),
    ] as const
  })

  ItLayer.make(it, "does not insert a recalled message when every item is empty", () => {
    let modelPrompt: Prompt.Prompt | undefined
    const agent = Agent.make({ name: "memory-agent" })
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          modelPrompt = options.prompt
          return Stream.make(textDelta("done"))
        }),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
        Memory.testLayer({
          recall: () => Effect.succeed([{ id: "item-empty", content: [] }]),
          remember: () => Effect.void,
          forget: () => Effect.void,
        }),
      ),
      Effect.gen(function* () {
        const result = yield* Agent.generate(agent, { prompt: "live prompt", memory: { key } })

        expect(result.text).toBe("done")
        expect(modelPrompt?.content.map(messageText)).toEqual(["live prompt"])
      }),
    ] as const
  })

  ItLayer.make(it, "remembers each completed turn with terminal state", () => {
    const remembers: Array<Memory.RememberInput> = []
    let recalls = 0
    let calls = 0
    const agent = Agent.make({ name: "memory-agent", toolkit: Toolkit.make(lookupTool) })
    return [
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
          forget: () => Effect.void,
        }),
      ),
      Effect.gen(function* () {
        const result = yield* Agent.generate(agent, { prompt: "use a tool", memory: { key } })

        expect(result.text).toBe("done")
        expect(recalls).toBe(1)
        expect(remembers.map((input) => ({ turn: input.turn, terminal: input.terminal }))).toEqual([
          { turn: 0, terminal: false },
          { turn: 1, terminal: true },
        ])
      }),
    ] as const
  })

  ItLayer.make(it, "does not recall on resume", () => {
    let recalls = 0
    const agent = Agent.make({ name: "memory-agent", toolkit: Toolkit.make(lookupTool) })
    return [
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
          forget: () => Effect.void,
        }),
      ),
      Effect.gen(function* () {
        const result = yield* Agent.generate(agent, {
          prompt: "ignored on resume",
          memory: { key },
          resume: { call: { id: "call-resume", name: "lookup", params: {} } },
        })

        expect(result.text).toBe("done")
        expect(recalls).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(it, "does not remember a suspending run", () => {
    const remembers: Array<Memory.RememberInput> = []
    const agent = Agent.make({ name: "memory-agent", toolkit: Toolkit.make(waitTool) })
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(toolCallPart("call-1", "wait", {}))),
        ToolExecutor.testLayer({ execute: () => Effect.succeed({ _tag: "Suspend", token: "wait-1" }) }),
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
        Memory.testLayer({
          recall: () => Effect.succeed([]),
          remember: (input) => Effect.sync(() => remembers.push(input)).pipe(Effect.asVoid),
          forget: () => Effect.void,
        }),
      ),
      Effect.gen(function* () {
        const failure = yield* Effect.flip(Stream.runDrain(Agent.stream(agent, { prompt: "wait", memory: { key } })))

        expect(failure._tag).toBe("@batonfx/core/AgentSuspended")
        expect(remembers).toEqual([])
      }),
    ] as const
  })

  ItLayer.make(it, "maps MemoryError to AgentError", () => {
    let modelCalls = 0
    const memoryError = Memory.MemoryError.make({ message: "memory unavailable" })
    const agent = Agent.make({ name: "memory-agent" })
    return [
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
          forget: () => Effect.void,
        }),
      ),
      Effect.gen(function* () {
        const failure = yield* Effect.flip(Agent.generate(agent, { prompt: "hello", memory: { key } }))

        expect(failure._tag).toBe("@batonfx/core/AgentError")
        if (failure._tag === "@batonfx/core/AgentError") {
          expect(failure.message).toBe("memory unavailable")
          expect(failure.turn).toBe(0)
          expect(failure.cause).toBe(memoryError)
        }
        expect(modelCalls).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(
    it,
    "noopLayer forget succeeds",
    () =>
      [
        Memory.noopLayer,
        Effect.gen(function* () {
          const memory = yield* Memory.Memory

          yield* memory.forget({ key })
        }),
      ] as const,
  )

  it.effect("merge calls both forget implementations", () => {
    const forgotten: Array<string> = []
    const first: Memory.Interface = {
      recall: () => Effect.succeed([]),
      remember: () => Effect.void,
      forget: (input) =>
        Effect.sync(() => forgotten.push(`first:${input.key.subject}:${input.id ?? "all"}`)).pipe(Effect.asVoid),
    }
    const second: Memory.Interface = {
      recall: () => Effect.succeed([]),
      remember: () => Effect.void,
      forget: (input) =>
        Effect.sync(() => forgotten.push(`second:${input.key.subject}:${input.id ?? "all"}`)).pipe(Effect.asVoid),
    }

    return Effect.gen(function* () {
      yield* Memory.merge(first, second).forget({ key, id: "memory-id" })

      expect(forgotten).toEqual(["first:subject-1:memory-id", "second:subject-1:memory-id"])
    })
  })

  ItLayer.make(it, "testLayer exposes forget", () => {
    let forgotten: Memory.ForgetInput | undefined
    return [
      Memory.testLayer({
        recall: () => Effect.succeed([]),
        remember: () => Effect.void,
        forget: (input) =>
          Effect.sync(() => {
            forgotten = input
          }),
      }),
      Effect.gen(function* () {
        const memory = yield* Memory.Memory

        yield* memory.forget({ key, id: "memory-id" })

        expect(forgotten).toEqual({ key, id: "memory-id" })
      }),
    ] as const
  })
})
