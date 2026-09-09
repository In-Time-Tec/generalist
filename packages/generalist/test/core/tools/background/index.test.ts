import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { make, run, stream } from "../../../../src/core/agent/service.js"
import { TestModel } from "../../../../src/testing/index.js"
import { Admission, BackgroundTools } from "../../../../src/core/tools/background/index.js"
import { setupStaticTools } from "../../../../src/core/agent/lifecycle/construction.js"
import { activateSkillTool } from "../../../../src/core/agent/skill-tool.js"
import { toolkit as messagingTools } from "../../../../src/runtime/steering.js"
import { startGroupTool } from "../../../../src/runtime/child/group.js"
import { Tasks } from "../../../../src/index.js"
import { Generalist, ToolIdentity } from "../../../../src/host/index.js"
import { layerAutoApprove } from "../../../../src/core/policy/approvals.js"
import { layerAllowAll } from "../../../../src/core/policy/permissions.js"
import { layerStatic } from "../../../../src/runtime/executable/resolver.js"
import { RunExecutor } from "../../../../src/runtime/execution/run-executor.js"
import { RunStore } from "../../../../src/runtime/run/store.js"
import { objectRuntimeLayer, objectWorkerId } from "../../../runtime/execution/object.js"

const tool = Tool.make("held_open", {
  parameters: Schema.Struct({ count: Schema.Finite }),
  success: Schema.FiniteFromString,
}).annotate(ToolIdentity, { implementation: "held-open-v1", policy: "held-open-policy-v1" })
const toolkit = Toolkit.make(tool)

it.effect("keeps injected Task controls on their owning Agent instead of admitting Tool Runs", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const services = yield* Layer.build(
        Layer.mergeAll(
          layerAllowAll,
          layerAutoApprove,
          Tasks.layer(),
          TestModel.layer([TestModel.toolCall("tasks_read", {}, {}), TestModel.text("read tasks")]),
          Layer.succeed(BackgroundTools, { admit: () => Effect.die("Task controls must remain inline") }),
        ),
      )
      const agent = make({ name: "task-controls", toolExecution: "background" })
      expect(yield* run(agent, "read tasks").pipe(Effect.provideContext(services))).toBe("read tasks")
    }),
  ),
)

it.effect("does not truncate an admission receipt using the inline output preview budget", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const receipt = { _tag: "ToolRunAdmitted" as const, runId: "admitted-run", tool: tool.name }
      const agent = make({ name: "receipt-bound", toolkit, toolExecution: "background" })
      const services = yield* Layer.build(
        Layer.mergeAll(
          layerAllowAll,
          layerAutoApprove,
          TestModel.layer([TestModel.toolCall(tool.name, { count: 1 }), TestModel.text("continued")]),
          toolkit.toLayer({ held_open: () => Effect.die("The admission adapter must not execute the handler") }),
          Layer.succeed(BackgroundTools, { admit: () => Effect.succeed(receipt) }),
        ),
      )
      const events = yield* stream(agent, "work", { toolOutputMaxBytes: 1 }).pipe(
        Stream.runCollect,
        Effect.provideContext(services),
      )
      const result = events.find((event) => event._tag === "ToolExecutionCompleted")
      expect(result).toMatchObject({ result: { result: receipt, encodedResult: receipt } })
    }),
  ),
)

it.effect("advertises receipts only for work while messaging and activation controls remain inline", () =>
  Effect.gen(function* () {
    const provider = Tool.providerDefined({
      id: "test.native",
      customName: "native",
      providerName: "native",
      args: Schema.Struct({}),
      success: Schema.String,
    })({})
    const controls = [...Object.values(messagingTools().tools), activateSkillTool, startGroupTool, provider]
    const agent = make({ name: "controls", tools: [tool, ...controls], toolExecution: "background" })
    const { staticRegistry } = yield* setupStaticTools(agent).pipe(
      Effect.provideService(BackgroundTools, {
        admit: () => Effect.die("Assembly must not admit work"),
      }),
    )
    expect(staticRegistry.toolkit.tools[tool.name]?.successSchema).toBe(Admission)
    expect(tool.successSchema).toBe(Schema.FiniteFromString)
    for (const control of controls) {
      expect(staticRegistry.toolkit.tools[String(control.name)]).toBe(control)
      expect(staticRegistry.entries.find((entry) => entry.tool === control)?.modelTool).toBeUndefined()
    }
    expect(make({ name: "inline-default" }).toolExecution).toBe("inline")
  }),
)
const finish = (reason: "stop" | "tool-calls") =>
  Response.makePart("finish", {
    reason,
    response: undefined,
    usage: Response.Usage.make({
      inputTokens: { uncached: 1, total: 1, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 1, text: 1, reasoning: undefined },
    }),
  })

it.effect("continues the parent model while its independently admitted typed tool is held open", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const admitted = yield* Deferred.make<typeof Admission.Type>()
    let modelCalls = 0
    let toolCalls = 0
    const agent = make({ name: "background-parent", toolkit, toolExecution: "background" })
    const handlers = toolkit.toLayer({
      held_open: ({ count }) =>
        Effect.gen(function* () {
          toolCalls += 1
          yield* Deferred.succeed(entered, undefined)
          yield* Deferred.await(release)
          return count + 1
        }),
    })
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: (options) => {
          modelCalls += 1
          if (modelCalls === 1)
            return Stream.make(
              Response.makePart("tool-call", {
                id: "held-call",
                name: tool.name,
                params: { count: 4 },
                providerExecuted: false,
              }),
              finish("tool-calls"),
            )
          return Stream.unwrap(
            Effect.gen(function* () {
              const results = options.prompt.content.flatMap((message) =>
                message.role === "tool" ? message.content : [],
              )
              const result = results.find((part) => part.type === "tool-result")
              if (result?.type !== "tool-result") return yield* Effect.die("Missing admission receipt")
              const receipt = yield* Schema.decodeUnknownEffect(Admission)(result.result).pipe(Effect.orDie)
              expect(receipt.tool).toBe(tool.name)
              expect(Schema.is(tool.successSchema)(receipt)).toBe(false)
              yield* Deferred.succeed(admitted, receipt)
              yield* Deferred.await(entered)
              expect(yield* Deferred.isDone(release)).toBe(false)
              return Stream.make(
                Response.makePart("text-delta", { id: "answer", delta: "independent work complete" }),
                finish("stop"),
              )
            }),
          )
        },
      }),
    )
    const environment = Layer.mergeAll(
      objectRuntimeLayer({ addresses: [] }).pipe(Layer.provide(layerStatic([]))),
      layerAllowAll,
      layerAutoApprove,
      handlers,
      model,
    )
    yield* Effect.scoped(
      Effect.gen(function* () {
        const context = yield* Layer.build(environment)
        yield* Effect.gen(function* () {
          const host = yield* Generalist.create({ agents: [agent], tools: [tool] })
          const session = yield* host.sessions.create({ id: "background-session" })
          const parent = yield* host.runs.start(session.id, agent, "start work")
          const store = yield* RunStore
          const executor = yield* RunExecutor
          const execute = (runId: string) =>
            store
              .claimExecution({ runId, ownerId: objectWorkerId, commandId: `execute:${runId}` })
              .pipe(Effect.flatMap(executor.execute))
          const parentFiber = yield* execute(parent.id).pipe(Effect.forkChild)
          const receipt = yield* Deferred.await(admitted).pipe(
            Effect.raceFirst(
              Fiber.join(parentFiber).pipe(
                Effect.andThen(parent.await),
                Effect.flatMap((output) => Effect.die(output)),
              ),
            ),
          )
          const childFiber = yield* execute(receipt.runId).pipe(Effect.forkChild)
          yield* Deferred.await(entered)
          yield* Fiber.join(parentFiber)
          expect(yield* parent.await).toBe("independent work complete")
          expect((yield* store.inspect(receipt.runId)).status).toBe("running")
          expect(modelCalls).toBe(2)
          expect(toolCalls).toBe(1)
          yield* Deferred.succeed(release, undefined)
          yield* Fiber.join(childFiber)
          const history = yield* store.history({ runId: receipt.runId, cursor: -1, limit: 100 })
          expect(history.at(-1)).toMatchObject({
            _tag: "RunCompleted",
            result: { _tag: "Tool", isFailure: false, value: "5" },
          })
        }).pipe(Effect.provideContext(context))
      }),
    )
  }),
)

it.effect("rejects explicit background execution without Runtime instead of spawning a fiber", () =>
  Effect.gen(function* () {
    const model = yield* LanguageModel.make({
      generateText: () => Effect.die("Model must not execute"),
      streamText: () => Stream.die("Model must not execute"),
    })
    const agent = make({ name: "requires-runtime", toolExecution: "background" })
    const failure = yield* run(agent, "hello").pipe(
      Effect.provideService(LanguageModel.LanguageModel, model),
      Effect.flip,
    )
    expect(failure).toMatchObject({ message: "Background tool execution requires a durable Runtime" })
  }),
)
