import { expect, layer } from "@effect/vitest"
import { Effect, Layer, Option, Ref, Schema, Stream } from "effect"
import { Chat, LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { expectTypeOf } from "vitest"
import {
  Agent,
  Approvals,
  Compaction,
  Guardrail,
  Memory,
  ModelMiddleware,
  Session,
  ToolExecutor,
} from "../../../src/core/index"
import { unusedToolHandlerLayer } from "../tool-handler-layer.js"
import { ItLayer } from "../it-layer.js"
import { withProviderFinish } from "../provider-finish.js"

type ModelParams = Parameters<typeof LanguageModel.make>[0]

const key: Memory.Key = { agent: "memory-agent", subject: "subject-1" }

const modelLayer = (streamText: ModelParams["streamText"]) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: (options) => withProviderFinish(streamText(options)),
    }),
  )

const textDelta = (delta: string) => Response.makePart("text-delta", { id: "text", delta })

const toolCallPart = (id: string, name: string, params: Schema.JsonObject) =>
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

const messageParts = (message: Prompt.Message): ReadonlyArray<Prompt.Part> =>
  message.role === "system" ? [] : message.content

const messageText = (message: Prompt.Message): string => {
  if (message.role === "system") return message.content
  return messageParts(message)
    .filter((part): part is Prompt.TextPart => part.type === "text")
    .map((part) => part.text)
    .join("")
}

const NestedPayload = Schema.Struct({ nested: Schema.Struct({ value: Schema.String }) })

const unusedExecutor = ToolExecutor.layerTest({ execute: () => Effect.die("unexpected tool execution") })

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
        providerExecuted: false,
        result: "result",
      }),
      Prompt.makePart("tool-approval-response", { approvalId: "approval-1", approved: true }),
      Prompt.makePart("tool-approval-request", { approvalId: "approval-1", toolCallId: "call-1" }),
    ]

    expect(Memory.itemFromPromptPart(text)).toEqual(Option.some(text))
    expect(Memory.itemFromPromptPart(file)).toEqual(Option.some(file))
    expect(protocolParts.map(Memory.itemFromPromptPart)).toEqual(protocolParts.map(() => Option.none()))
  })

  it("projects recalled origin structurally while retaining identical authored content", () => {
    const recalled = Memory.messageFromRecall([textPart("identical")])
    const authored = Prompt.makeMessage("user", { content: [textPart("identical")] })

    expect(Memory.projectTranscript(Prompt.fromMessages([recalled, authored])).content).toEqual([authored])
  })

  it.effect("preserves recall origin through Chat export and restore", () =>
    Effect.gen(function* () {
      const recalled = Memory.messageFromRecall([textPart("persisted recall")])
      const authored = Prompt.makeMessage("user", { content: [textPart("persisted authored")] })
      const chat = yield* Chat.fromPrompt([recalled, authored])
      const exported = yield* chat.export
      const restored = yield* Chat.fromExport(exported)
      const history = yield* Ref.get(restored.history)

      expect(history.content[0]?.options).toEqual({
        "tenetkit/memory": { origin: "memoryRecall" },
      })
      expect(Memory.projectTranscript(history).content.map(messageText)).toEqual(["persisted authored"])
    }),
  )

  ItLayer.make(it, "inserts recalled content and remembers only the authored completed transcript", () => {
    let modelPrompt: Prompt.Prompt | undefined
    let middlewarePrompt: Prompt.Prompt | undefined
    let remembered: Memory.RememberInput | undefined
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layer([
          {
            transformPrompt: (prompt) => {
              middlewarePrompt = prompt
              return Effect.succeed(prompt)
            },
          },
        ]),
        Memory.layerTest({
          recall: () =>
            Effect.succeed([
              { id: "item-empty", content: [] },
              { id: "item-text", content: [textPart("remembered context")] },
              { id: "item-file", content: [file] },
            ]),
          remember: (input) =>
            Effect.sync(() => {
              remembered = input
            }),
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
        expect(recalledMessage?.options).toEqual({
          "tenetkit/memory": { origin: "memoryRecall" },
        })
        expect(remembered?.transcript.content.map(messageText)).toEqual(["system instructions", "live prompt", "done"])
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        Memory.layerTest({
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

  ItLayer.make(it, "fails typed before the model when middleware drops recall provenance", () => {
    let modelCalls = 0
    let remembered = false
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layer([
          {
            transformPrompt: (prompt) =>
              Effect.succeed(
                Prompt.fromMessages(
                  prompt.content.map((message) =>
                    message.role === "user" ? Prompt.makeMessage("user", { content: message.content }) : message,
                  ),
                ),
              ),
          },
        ]),
        Memory.layerTest({
          recall: () => Effect.succeed([{ id: "recalled", content: [textPart("recalled context")] }]),
          remember: () =>
            Effect.sync(() => {
              remembered = true
            }),
          forget: () => Effect.void,
        }),
      ),
      Effect.gen(function* () {
        const failure = yield* Effect.flip(Agent.generate(agent, { prompt: "live prompt", memory: { key } }))

        expect(failure._tag).toBe("tenetkit/core/MiddlewareViolation")
        expect(modelCalls).toBe(0)
        expect(remembered).toBe(false)
      }),
    ] as const
  })

  ItLayer.make(it, "fails typed when middleware moves recall provenance onto authored content", () => {
    let modelCalls = 0
    let remembered = false
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layer([
          {
            transformPrompt: (prompt) => {
              const recalled = prompt.content.find((message) => messageText(message) === "recalled context")
              return Effect.succeed(
                Prompt.fromMessages(
                  prompt.content.map((message) => {
                    if (message.role !== "user") return message
                    if (messageText(message) === "recalled context") {
                      return Prompt.makeMessage("user", { content: message.content })
                    }
                    if (messageText(message) === "live prompt") {
                      return Prompt.makeMessage("user", { content: message.content, options: recalled?.options })
                    }
                    return message
                  }),
                ),
              )
            },
          },
        ]),
        Memory.layerTest({
          recall: () => Effect.succeed([{ id: "recalled", content: [textPart("recalled context")] }]),
          remember: () =>
            Effect.sync(() => {
              remembered = true
            }),
          forget: () => Effect.void,
        }),
      ),
      Effect.gen(function* () {
        const failure = yield* Effect.flip(Agent.generate(agent, { prompt: "live prompt", memory: { key } }))

        expect(failure._tag).toBe("tenetkit/core/MiddlewareViolation")
        expect(modelCalls).toBe(0)
        expect(remembered).toBe(false)
      }),
    ] as const
  })

  ItLayer.make(it, "fails typed when middleware moves recall provenance in place", () => {
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layer([
          {
            transformPrompt: (prompt) =>
              Effect.sync(() => {
                const recalled = prompt.content.find((message) => messageText(message) === "recalled context")
                const authored = prompt.content.find((message) => messageText(message) === "live prompt")
                const marker = recalled?.options["tenetkit/memory"]
                if (recalled !== undefined && authored !== undefined) {
                  Reflect.deleteProperty(recalled.options, "tenetkit/memory")
                  Object.assign(authored.options, { "tenetkit/memory": marker })
                }
                return prompt
              }),
          },
        ]),
        Memory.layerTest({
          recall: () => Effect.succeed([{ id: "recalled", content: [textPart("recalled context")] }]),
          remember: () => Effect.void,
          forget: () => Effect.void,
        }),
      ),
      Effect.gen(function* () {
        const failure = yield* Effect.flip(Agent.generate(agent, { prompt: "live prompt", memory: { key } }))

        expect(failure._tag).toBe("tenetkit/core/MiddlewareViolation")
        expect(modelCalls).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(it, "allows input guardrails to redact recalled content without losing provenance", () => {
    let modelPrompt: Prompt.Prompt | undefined
    let remembered: Memory.RememberInput | undefined
    const agent = Agent.make({ name: "memory-agent" })
    return [
      Layer.mergeAll(
        modelLayer((params) => {
          modelPrompt = params.prompt
          return Stream.make(textDelta("done"))
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layer([Guardrail.redactInput({ pattern: /secret/g, replacement: "MASK" })]),
        Memory.layerTest({
          recall: () => Effect.succeed([{ id: "recalled", content: [textPart("recalled secret")] }]),
          remember: (input) =>
            Effect.sync(() => {
              remembered = input
            }),
          forget: () => Effect.void,
        }),
      ),
      Effect.gen(function* () {
        const result = yield* Agent.generate(agent, { prompt: "authored secret", memory: { key } })

        expect(result.text).toBe("done")
        expect(modelPrompt?.content.map(messageText)).toEqual(["recalled MASK", "authored MASK"])
        expect(remembered?.transcript.content.map(messageText)).toEqual(["authored MASK", "done"])
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
        ToolExecutor.layerTest({
          execute: () => Effect.succeed({ _tag: "Success", result: "ok", encodedResult: "ok" }),
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        Memory.layerTest({
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
    const remembers: Array<Memory.RememberInput> = []
    let modelCalls = 0
    let executions = 0
    let checkpoint: Prompt.Prompt | undefined
    const agent = Agent.make({ name: "memory-agent", toolkit: Toolkit.make(lookupTool) })
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return modelCalls === 1
            ? Stream.make(toolCallPart("call-resume", "lookup", {}))
            : Stream.make(textDelta("done"))
        }),
        ToolExecutor.layerTest({
          execute: () => {
            executions += 1
            return executions === 1
              ? Effect.succeed({ _tag: "Suspend", token: "memory-resume" })
              : Effect.succeed({ _tag: "Success", result: "ok", encodedResult: "ok" })
          },
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        Memory.layerTest({
          recall: () =>
            Effect.sync(() => {
              recalls += 1
              return [{ id: "recalled", content: [textPart("recalled before suspension")] }]
            }),
          remember: (input) => Effect.sync(() => remembers.push(input)).pipe(Effect.asVoid),
          forget: () => Effect.void,
        }),
      ),
      Effect.gen(function* () {
        const suspension = yield* Agent.stream(agent, {
          prompt: "authored before suspension",
          memory: { key },
        }).pipe(
          Stream.tap((event) =>
            Effect.sync(() => {
              if (event._tag === "TurnCompleted") checkpoint = event.transcript
            }),
          ),
          Stream.runDrain,
          Effect.flip,
        )
        if (suspension._tag !== "tenetkit/core/AgentSuspended" || checkpoint === undefined) {
          return yield* Effect.die("missing memory suspension checkpoint")
        }
        recalls = 0
        const result = yield* Agent.generate(agent, {
          prompt: "ignored on resume",
          history: checkpoint,
          memory: { key },
          resume: { suspension },
        })

        expect(result.text).toBe("done")
        expect(recalls).toBe(0)
        expect(remembers.length).toBe(2)
        for (const remembered of remembers) {
          expect(remembered.transcript.content.map(messageText)).not.toContain("recalled before suspension")
          expect(remembered.transcript.content.map(messageText)).toContain("authored before suspension")
        }
      }),
    ] as const
  })

  ItLayer.make(it, "does not remember a suspending run", () => {
    const remembers: Array<Memory.RememberInput> = []
    const agent = Agent.make({ name: "memory-agent", toolkit: Toolkit.make(waitTool) })
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(toolCallPart("call-1", "wait", {}))),
        ToolExecutor.layerTest({ execute: () => Effect.succeed({ _tag: "Suspend", token: "wait-1" }) }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        Memory.layerTest({
          recall: () => Effect.succeed([]),
          remember: (input) => Effect.sync(() => remembers.push(input)).pipe(Effect.asVoid),
          forget: () => Effect.void,
        }),
      ),
      Effect.gen(function* () {
        const failure = yield* Effect.flip(Stream.runDrain(Agent.stream(agent, { prompt: "wait", memory: { key } })))

        expect(failure._tag).toBe("tenetkit/core/AgentSuspended")
        expect(remembers).toEqual([])
      }),
    ] as const
  })

  ItLayer.make(it, "retains Session provenance and authored transcript across suspension and resume", () => {
    const remembers: Array<Memory.RememberInput> = []
    let executions = 0
    let modelCalls = 0
    let checkpoint: Prompt.Prompt | undefined
    const agent = Agent.make({ name: "memory-agent", toolkit: Toolkit.make(waitTool) })
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return modelCalls === 1 ? Stream.make(toolCallPart("call-wait", "wait", {})) : Stream.make(textDelta("done"))
        }),
        ToolExecutor.layerTest({
          execute: () => {
            executions += 1
            return Effect.succeed(
              executions === 1
                ? { _tag: "Suspend" as const, token: "wait-1" }
                : { _tag: "Success" as const, result: "ok", encodedResult: "ok" },
            )
          },
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        Compaction.layer({}),
        Session.layerMemory,
        Memory.layerTest({
          recall: () => Effect.succeed([{ id: "recalled", content: [textPart("recalled before wait")] }]),
          remember: (input) => Effect.sync(() => remembers.push(input)).pipe(Effect.asVoid),
          forget: () => Effect.void,
        }),
      ),
      Effect.gen(function* () {
        const failure = yield* Effect.flip(
          Agent.stream(agent, { prompt: "authored before wait", memory: { key } }).pipe(
            Stream.tap((event) =>
              Effect.sync(() => {
                if (event._tag === "TurnCompleted") checkpoint = event.transcript
              }),
            ),
            Stream.runDrain,
          ),
        )

        expect(failure._tag).toBe("tenetkit/core/AgentSuspended")
        expect(checkpoint).toBeDefined()
        expect(remembers).toEqual([])
        if (failure._tag !== "tenetkit/core/AgentSuspended" || checkpoint === undefined) return expect.unreachable()

        const result = yield* Agent.generate(agent, {
          prompt: "ignored on resume",
          history: checkpoint,
          memory: { key },
          resume: { suspension: failure },
        })

        expect(result.text).toBe("done")
        expect(remembers.length).toBe(2)
        const rememberedText = remembers.map((input) => input.transcript.content.map(messageText))
        expect(rememberedText[0]).toContain("authored before wait")
        expect(rememberedText[1]).toContain("authored before wait")
        expect(rememberedText.flat()).not.toContain("recalled before wait")
      }),
    ] as const
  })

  ItLayer.make(it, "remembers lossless authored and tool context instead of a compaction checkpoint", () => {
    const remembers: Array<Memory.RememberInput> = []
    let modelCalls = 0
    const agent = Agent.make({ name: "memory-agent", toolkit: Toolkit.make(lookupTool) })
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return modelCalls === 1
            ? Stream.make(toolCallPart("call-compact", "lookup", {}))
            : Stream.make(textDelta("done"))
        }),
        ToolExecutor.layerTest({
          execute: () => Effect.succeed({ _tag: "Success", result: "tool value", encodedResult: "tool value" }),
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        Compaction.layerTest({
          maybeCompact: (request) => {
            if (request.turn === 0) return Effect.succeedNone
            const firstKept = request.path?.at(-1)
            if (firstKept === undefined) return Effect.succeedNone
            return Effect.succeed(
              Option.some({
                _tag: "Summarize" as const,
                history: Prompt.fromMessages([
                  Prompt.makeMessage("user", {
                    content: [
                      textPart("<conversation-checkpoint>\nrecall-derived summary\n</conversation-checkpoint>"),
                    ],
                  }),
                ]),
                prompt: request.prompt,
                summary: "recall-derived summary",
              }),
            ).pipe(Compaction.withLifecycle(request))
          },
        }),
        Session.layerMemory,
        Memory.layerTest({
          recall: () => Effect.succeed([{ id: "recalled", content: [textPart("recalled context")] }]),
          remember: (input) => Effect.sync(() => remembers.push(input)).pipe(Effect.asVoid),
          forget: () => Effect.void,
        }),
      ),
      Effect.gen(function* () {
        const result = yield* Agent.generate(agent, { prompt: "authored context", memory: { key } })

        expect(result.text).toBe("done")
        expect(remembers.length).toBe(2)
        const terminal = remembers[1]
        expect(terminal?.transcript.content.map(messageText)).toContain("authored context")
        expect(terminal?.transcript.content.map(messageText)).not.toContain("recalled context")
        expect(terminal?.transcript.content.map(messageText).join("\n")).not.toContain("conversation-checkpoint")
        const toolResults = terminal?.transcript.content.flatMap((message) =>
          messageParts(message).filter((part) => part.type === "tool-result" && part.id === "call-compact"),
        )
        expect(toolResults).toHaveLength(1)
      }),
    ] as const
  })

  ItLayer.make(it, "fails typed when Session-backed compaction strips current-prompt recall provenance", () => {
    let modelCalls = 0
    let remembered = false
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        Compaction.layerTest({
          maybeCompact: (request) =>
            Effect.succeed(
              Option.some({
                _tag: "Microcompact",
                history: request.history,
                prompt: Prompt.fromMessages(
                  request.prompt.content.map((message) =>
                    message.role === "user" ? Prompt.makeMessage("user", { content: message.content }) : message,
                  ),
                ),
              }),
            ),
        }),
        Session.layerMemory,
        Memory.layerTest({
          recall: () => Effect.succeed([{ id: "recalled", content: [textPart("recalled context")] }]),
          remember: () =>
            Effect.sync(() => {
              remembered = true
            }),
          forget: () => Effect.void,
        }),
      ),
      Effect.gen(function* () {
        const failure = yield* Effect.flip(Agent.generate(agent, { prompt: "live prompt", memory: { key } }))

        expect(failure._tag).toBe("tenetkit/core/MiddlewareViolation")
        expect(modelCalls).toBe(0)
        expect(remembered).toBe(false)
      }),
    ] as const
  })

  ItLayer.make(it, "fails typed when Session-backed compaction strips current-prompt provenance in place", () => {
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        Compaction.layerTest({
          maybeCompact: (request) =>
            Effect.sync(() => {
              const recalled = request.prompt.content.find((message) => messageText(message) === "recalled context")
              if (recalled !== undefined) Reflect.deleteProperty(recalled.options, "tenetkit/memory")
              return Option.some({
                _tag: "Microcompact" as const,
                history: request.history,
                prompt: request.prompt,
              })
            }),
        }),
        Session.layerMemory,
        Memory.layerTest({
          recall: () => Effect.succeed([{ id: "recalled", content: [textPart("recalled context")] }]),
          remember: () => Effect.void,
          forget: () => Effect.void,
        }),
      ),
      Effect.gen(function* () {
        const failure = yield* Effect.flip(Agent.generate(agent, { prompt: "live prompt", memory: { key } }))

        expect(failure._tag).toBe("tenetkit/core/MiddlewareViolation")
        expect(modelCalls).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(it, "isolates the current prompt when Session-backed compaction mutates and declines", () => {
    let modelPrompt: Prompt.Prompt | undefined
    const bytes = Prompt.makePart("file", {
      mediaType: "application/octet-stream",
      fileName: "bytes.bin",
      data: new Uint8Array([1, 2, 3]),
    })
    const url = Prompt.makePart("file", {
      mediaType: "text/plain",
      fileName: "reference.txt",
      data: new URL("https://example.com/original"),
    })
    const agent = Agent.make({ name: "memory-agent" })
    return [
      Layer.mergeAll(
        modelLayer((params) => {
          modelPrompt = params.prompt
          return Stream.make(textDelta("done"))
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        Compaction.layerTest({
          maybeCompact: (request) =>
            Effect.sync(() => {
              const recalled = request.prompt.content.find((message) => messageText(message) === "recalled context")
              if (recalled !== undefined) {
                Reflect.deleteProperty(recalled.options, "tenetkit/memory")
                const text = messageParts(recalled).find((part) => part.type === "text")
                if (text !== undefined) Object.assign(text, { text: "mutated recalled context" })
                for (const part of messageParts(recalled)) {
                  if (part.type !== "file") continue
                  if (part.data instanceof Uint8Array) part.data[0] = 9
                  if (part.data instanceof URL) part.data.pathname = "/mutated"
                }
              }
              return Option.none()
            }),
        }),
        Session.layerMemory,
        Memory.layerTest({
          recall: () => Effect.succeed([{ id: "recalled", content: [textPart("recalled context"), bytes, url] }]),
          remember: () => Effect.void,
          forget: () => Effect.void,
        }),
      ),
      Effect.gen(function* () {
        const result = yield* Agent.generate(agent, { prompt: "live prompt", memory: { key } })

        expect(result.text).toBe("done")
        expect(modelPrompt?.content[0]?.options).toEqual({
          "tenetkit/memory": { origin: "memoryRecall" },
        })
        expect(modelPrompt?.content.map(messageText)).toContain("recalled context")
        expect(modelPrompt?.content.map(messageText)).not.toContain("mutated recalled context")
        const files = modelPrompt?.content.flatMap((message) =>
          messageParts(message).filter((part) => part.type === "file"),
        )
        expect(files?.[0]?.data).toEqual(new Uint8Array([1, 2, 3]))
        expect(files?.[1]?.data).toEqual(new URL("https://example.com/original"))
      }),
    ] as const
  })

  ItLayer.make(it, "isolates synchronized Session history from in-place compaction mutation", () => {
    let modelCalls = 0
    const agent = Agent.make({ name: "memory-agent", toolkit: Toolkit.make(lookupTool) })
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return modelCalls === 1
            ? Stream.make(toolCallPart("call-history", "lookup", { nested: { value: "original params" } }))
            : Stream.make(textDelta("done"))
        }),
        ToolExecutor.layerTest({
          execute: () =>
            Effect.succeed({
              _tag: "Success",
              result: { nested: { value: "original result" } },
              encodedResult: { nested: { value: "original result" } },
            }),
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        Compaction.layerTest({
          maybeCompact: (request) => {
            if (request.turn === 0) return Effect.succeedNone
            return Effect.sync(() => {
              const recalled = request.history.content.find((message) => messageText(message) === "recalled context")
              if (recalled !== undefined) Reflect.deleteProperty(recalled.options, "tenetkit/memory")
              const authored = request.history.content.find((message) => messageText(message) === "live prompt")
              const text =
                authored === undefined ? undefined : messageParts(authored).find((part) => part.type === "text")
              if (text !== undefined) Object.assign(text, { text: "corrupted authored context" })
              for (const message of request.history.content) {
                for (const part of messageParts(message)) {
                  if (part.type === "tool-call" && Schema.is(NestedPayload)(part.params)) {
                    Object.assign(part.params.nested, { value: "mutated params" })
                  }
                  if (part.type === "tool-result" && Schema.is(NestedPayload)(part.result)) {
                    Object.assign(part.result.nested, { value: "mutated result" })
                  }
                }
              }
              return Option.some({
                _tag: "Microcompact" as const,
                history: Prompt.fromMessages([]),
                prompt: request.prompt,
              })
            }).pipe(Compaction.withLifecycle(request))
          },
        }),
        Session.layerMemory,
        Memory.layerTest({
          recall: () => Effect.succeed([{ id: "recalled", content: [textPart("recalled context")] }]),
          remember: () => Effect.void,
          forget: () => Effect.void,
        }),
      ),
      Effect.gen(function* () {
        const result = yield* Agent.generate(agent, {
          prompt: "live prompt",
          sessionId: "session-compaction-isolation",
          memory: { key },
        })
        const memoryTranscript = yield* Effect.scoped(
          Session.acquire("session-compaction-isolation").pipe(
            Effect.flatMap((session) => session.path()),
            Effect.map(Session.buildMemoryContext),
          ),
        )

        expect(result.text).toBe("done")
        expect(modelCalls).toBe(2)
        expect(memoryTranscript.content.map(messageText)).toContain("live prompt")
        expect(memoryTranscript.content.map(messageText)).not.toContain("corrupted authored context")
        expect(memoryTranscript.content.map(messageText)).not.toContain("recalled context")
        const parts = memoryTranscript.content.flatMap(messageParts)
        const call = parts.find(
          (part): part is Prompt.ToolCallPart => part.type === "tool-call" && part.id === "call-history",
        )
        const toolResult = parts.find(
          (part): part is Prompt.ToolResultPart => part.type === "tool-result" && part.id === "call-history",
        )
        expect(yield* Schema.decodeUnknownEffect(NestedPayload)(call?.params)).toEqual({
          nested: { value: "original params" },
        })
        expect(yield* Schema.decodeUnknownEffect(NestedPayload)(toolResult?.result)).toEqual({
          nested: { value: "original result" },
        })
      }),
    ] as const
  })

  ItLayer.make(it, "isolates opaque tool payloads when Session-backed compaction mutates and declines", () => {
    let modelCalls = 0
    let terminalPrompt: Prompt.Prompt | undefined
    const agent = Agent.make({ name: "memory-agent", toolkit: Toolkit.make(lookupTool) })
    return [
      Layer.mergeAll(
        modelLayer((request) => {
          modelCalls += 1
          if (modelCalls === 1) {
            return Stream.make(toolCallPart("call-opaque", "lookup", { nested: { value: "original params" } }))
          }
          terminalPrompt = request.prompt
          return Stream.make(textDelta("done"))
        }),
        ToolExecutor.layerTest({
          execute: () =>
            Effect.succeed({
              _tag: "Success",
              result: { nested: { value: "original result" } },
              encodedResult: { nested: { value: "original result" } },
            }),
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        Compaction.layerTest({
          maybeCompact: (request) =>
            Effect.sync(() => {
              if (request.turn === 0) return Option.none()
              for (const message of request.history.content) {
                for (const part of messageParts(message)) {
                  if (part.type === "tool-call" && Schema.is(NestedPayload)(part.params)) {
                    Object.assign(part.params.nested, { value: "mutated params" })
                  }
                  if (part.type === "tool-result" && Schema.is(NestedPayload)(part.result)) {
                    Object.assign(part.result.nested, { value: "mutated result" })
                  }
                }
              }
              return Option.none()
            }),
        }),
        Session.layerMemory,
        Memory.layerTest({
          recall: () => Effect.succeed([]),
          remember: () => Effect.void,
          forget: () => Effect.void,
        }),
      ),
      Effect.gen(function* () {
        const result = yield* Agent.generate(agent, {
          prompt: "use opaque values",
          sessionId: "session-opaque-compaction",
          memory: { key },
        })
        const retained = yield* Effect.scoped(
          Session.acquire("session-opaque-compaction").pipe(
            Effect.flatMap((session) => session.path()),
            Effect.map(Session.buildMemoryContext),
          ),
        )
        const prompts = [terminalPrompt, retained].filter((prompt): prompt is Prompt.Prompt => prompt !== undefined)

        expect(result.text).toBe("done")
        expect(prompts).toHaveLength(2)
        for (const prompt of prompts) {
          const parts = prompt.content.flatMap(messageParts)
          const call = parts.find(
            (part): part is Prompt.ToolCallPart => part.type === "tool-call" && part.id === "call-opaque",
          )
          const toolResult = parts.find(
            (part): part is Prompt.ToolResultPart => part.type === "tool-result" && part.id === "call-opaque",
          )
          expect(yield* Schema.decodeUnknownEffect(NestedPayload)(call?.params)).toEqual({
            nested: { value: "original params" },
          })
          expect(yield* Schema.decodeUnknownEffect(NestedPayload)(toolResult?.result)).toEqual({
            nested: { value: "original result" },
          })
        }
      }),
    ] as const
  })

  ItLayer.make(it, "aligns an existing compacted Session before appending a subsequent run", () => {
    let modelCalls = 0
    const remembers: Array<Memory.RememberInput> = []
    const agent = Agent.make({
      name: "memory-agent",
      instructions: "system instructions",
      toolkit: Toolkit.make(lookupTool),
    })
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return modelCalls === 1
            ? Stream.make(toolCallPart("call-existing-session", "lookup", {}))
            : Stream.make(textDelta(modelCalls === 2 ? "first done" : "second done"))
        }),
        ToolExecutor.layerTest({
          execute: () => Effect.succeed({ _tag: "Success", result: "tool value", encodedResult: "tool value" }),
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        Compaction.layerTest({
          maybeCompact: (request) => {
            if (request.turn === 0) return Effect.succeedNone
            const firstKept = request.path?.at(-1)
            const system = request.history.content.find((message) => message.role === "system")
            if (firstKept === undefined || system === undefined) return Effect.succeedNone
            return Effect.succeed(
              Option.some({
                _tag: "Summarize" as const,
                history: Prompt.fromMessages([
                  system,
                  Prompt.makeMessage("user", {
                    content: [textPart("<conversation-checkpoint>\nsummary\n</conversation-checkpoint>")],
                  }),
                ]),
                prompt: request.prompt,
                summary: "summary",
              }),
            ).pipe(Compaction.withLifecycle(request))
          },
        }),
        Session.layerMemory,
        Memory.layerTest({
          recall: () => Effect.succeed([{ id: "recalled", content: [textPart("recalled context")] }]),
          remember: (input) => Effect.sync(() => remembers.push(input)).pipe(Effect.asVoid),
          forget: () => Effect.void,
        }),
      ),
      Effect.gen(function* () {
        const sessionId = "session-existing-compaction"
        const first = yield* Agent.generate(agent, { prompt: "first authored", sessionId, memory: { key } })
        const projected = yield* Effect.scoped(
          Session.acquire(sessionId).pipe(
            Effect.flatMap((session) =>
              Effect.gen(function* () {
                const firstPath = yield* session.path()
                const compaction = firstPath.find((entry) => entry._tag === "Compaction")
                if (compaction === undefined) return yield* Effect.die("missing compaction entry")
                yield* session.setLeaf(compaction.id)
                return Session.buildContext(yield* session.path())
              }),
            ),
          ),
        )
        const resumedHistory = Prompt.fromMessages([
          Prompt.makeMessage("system", { content: "system instructions" }),
          ...projected.content,
          Prompt.makeMessage("assistant", { content: [textPart("first done")] }),
        ])

        expect(first.text).toBe("first done")
        // The checkpoint stores conversation only; the system message stays derived per run.
        expect(projected.content).toHaveLength(1)
        expect(projected.content.every((message) => message.role !== "system")).toBe(true)

        const second = yield* Agent.generate(agent, {
          prompt: "second authored",
          sessionId,
          history: resumedHistory,
          memory: { key },
        })
        const retained = yield* Effect.scoped(
          Session.acquire(sessionId).pipe(
            Effect.flatMap((session) => session.path()),
            Effect.map(Session.buildMemoryContext),
          ),
        )
        const retainedText = retained.content.map(messageText)

        expect(second.text).toBe("second done")
        expect(retainedText.filter((text) => text === "first done")).toHaveLength(1)
        expect(retainedText.filter((text) => text === "second authored")).toHaveLength(1)
        expect(retainedText).not.toContain("recalled context")
        expect(remembers.at(-1)?.transcript.content.map(messageText)).toEqual(retainedText)
      }),
    ] as const
  })

  ItLayer.make(it, "appends a repeated authored suffix instead of ambiguously skipping it", () => {
    const agent = Agent.make({ name: "memory-agent" })
    const repeated = Prompt.makeMessage("user", { content: [textPart("same authored content")] })
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(textDelta("done"))),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        Compaction.layer({}),
        Session.layerMemory,
        Memory.layerTest({
          recall: () => Effect.succeed([]),
          remember: () => Effect.void,
          forget: () => Effect.void,
        }),
      ),
      Effect.gen(function* () {
        const sessionId = "session-repeated-suffix"
        yield* Effect.scoped(
          Session.acquire(sessionId).pipe(
            Effect.flatMap((session) => session.append({ _tag: "Message", message: repeated })),
          ),
        )

        const result = yield* Agent.generate(agent, {
          prompt: "new authored content",
          sessionId,
          history: Prompt.fromMessages([repeated, repeated]),
          memory: { key },
        })
        const retainedText = yield* Effect.scoped(
          Session.acquire(sessionId).pipe(
            Effect.flatMap((session) => session.path()),
            Effect.map(Session.buildMemoryContext),
            Effect.map((context) => context.content.map(messageText)),
          ),
        )

        expect(result.text).toBe("done")
        expect(retainedText.filter((text) => text === "same authored content")).toHaveLength(2)
        expect(retainedText.filter((text) => text === "new authored content")).toHaveLength(1)
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        Memory.layerTest({
          recall: () => Effect.fail(memoryError),
          remember: () => Effect.void,
          forget: () => Effect.void,
        }),
      ),
      Effect.gen(function* () {
        const failure = yield* Effect.flip(Agent.generate(agent, { prompt: "hello", memory: { key } }))

        expect(failure._tag).toBe("tenetkit/core/AgentError")
        if (failure._tag === "tenetkit/core/AgentError") {
          expect(failure.message).toBe("memory unavailable")
          expect(failure.turn).toBe(0)
          expect(failure.cause).toBe(memoryError)
        }
        expect(modelCalls).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(it, "maps remember MemoryError before completion", () => {
    const memoryError = Memory.MemoryError.make({ message: "memory write unavailable" })
    const events: Array<string> = []
    const agent = Agent.make({ name: "memory-agent" })
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(textDelta("done"))),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        Memory.layerTest({
          recall: () => Effect.succeed([]),
          remember: () => Effect.fail(memoryError),
          forget: () => Effect.void,
        }),
      ),
      Effect.gen(function* () {
        const failure = yield* Effect.flip(
          Agent.stream(agent, { prompt: "hello", memory: { key } }).pipe(
            Stream.tap((event) =>
              Effect.sync(() => {
                events.push(event._tag)
              }),
            ),
            Stream.runDrain,
          ),
        )

        expect(failure._tag).toBe("tenetkit/core/AgentError")
        if (failure._tag === "tenetkit/core/AgentError") {
          expect(failure.message).toBe("memory write unavailable")
          expect(failure.turn).toBe(0)
          expect(failure.cause).toBe(memoryError)
        }
        expect(events).not.toContain("TurnCompleted")
        expect(events).not.toContain("Completed")
      }),
    ] as const
  })

  ItLayer.make(
    it,
    "layerNoop forget succeeds",
    () =>
      [
        Memory.layerNoop,
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

  ItLayer.make(it, "layerTest exposes forget", () => {
    let forgotten: Memory.ForgetInput | undefined
    return [
      Memory.layerTest({
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
