import { expect, layer } from "@effect/vitest"
import { Json } from "./json"
import { Deferred, Effect, Exit, Fiber, Layer, Schedule, Schema, Stream } from "effect"
import { TestClock } from "effect/testing"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import {
  Agent,
  AgentEvent,
  AgentTool,
  Approvals,
  Memory,
  ModelMiddleware,
  ToolContext,
  ToolExecutor,
} from "../src/index"
import { unusedToolHandlerLayer } from "./tool-handler-layer"
import { ItLayer } from "./it-layer"

type ModelParams = Parameters<typeof LanguageModel.make>[0]
type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false
type Assert<Value extends true> = Value
type ToolkitRequirements<Value> =
  Value extends Toolkit.WithHandler<infer Tools> ? Tool.HandlerServices<Tools[keyof Tools]> : never

const requirementChild = Agent.make({
  name: "requirement-child",
  memory: { agent: "requirement-child", subject: "subject" },
})
const requirementChildTool = AgentTool.asTool(requirementChild)
const agentToolRequirementProof: Assert<
  Equal<ToolkitRequirements<typeof requirementChildTool>, LanguageModel.LanguageModel | Memory.Memory>
> = true

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

const activeToolNames = (options: Parameters<ModelParams["streamText"]>[0]) => options.tools.map((tool) => tool.name)

const request = (name: string, params: unknown): ToolExecutor.Request => ({
  call: toolCallPart(`call-${name}`, name, params),
  turn: 0,
  agentName: "tool-executor-test",
  sessionId: "session-1",
})

const gatedTool = Tool.make("gated", {
  description: "Needs child approval",
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.String,
  needsApproval: true,
})

layer(unusedToolHandlerLayer)("AgentTool", (it) => {
  expect(agentToolRequirementProof).toBe(true)

  ItLayer.make(it, "ToolExecutor.fromToolkit maps returned handler failures to failed outcomes", () => {
    const failingTool = Tool.make("failing", {
      parameters: Schema.Struct({}),
      success: Schema.String,
      failure: Schema.String,
      failureMode: "return",
    })
    const toolkit = Toolkit.make(failingTool)
    const handlers = toolkit.toLayer({ failing: () => Effect.fail("child failed") })
    return [
      Layer.mergeAll(
        handlers,
        ToolExecutor.fromToolkit(toolkit).pipe(Layer.provide(handlers)),
        ToolContext.layerDefault,
      ),
      Effect.gen(function* () {
        const outcome = yield* ToolExecutor.ToolExecutor.use((executor) => executor.execute(request("failing", {})))

        expect(outcome).toEqual({ _tag: "Failure", message: "child failed" })
      }),
    ] as const
  })

  ItLayer.make(it, "ToolExecutor.fromToolkit preserves handler interruptions", () => {
    const interruptingTool = Tool.make("interrupting", {
      parameters: Schema.Struct({}),
      success: Schema.String,
    })
    const toolkit = Toolkit.make(interruptingTool)
    const handlers = toolkit.toLayer({ interrupting: () => Effect.interrupt })
    return [
      Layer.mergeAll(
        handlers,
        ToolExecutor.fromToolkit(toolkit).pipe(Layer.provide(handlers)),
        ToolContext.layerDefault,
      ),
      Effect.gen(function* () {
        const exit = yield* ToolExecutor.ToolExecutor.use((executor) =>
          executor.execute(request("interrupting", {})),
        ).pipe(Effect.exit)

        expect(Exit.hasInterrupts(exit)).toBe(true)
      }),
    ] as const
  })

  ItLayer.make(it, "ToolExecutor.router dispatches named routes without redefining tools", () => {
    const lookupTool = Tool.make("lookup", {
      parameters: Schema.Struct({ id: Schema.String }),
      success: Schema.Struct({ source: Schema.String, id: Schema.String }),
    })
    const toolkit = Toolkit.make(lookupTool)

    return [
      Layer.mergeAll(
        ToolExecutor.router([
          ToolExecutor.routeToolkit(toolkit),
          ToolExecutor.route({
            tools: ["remote"],
            execute: () =>
              Effect.succeed({
                _tag: "Success",
                result: { source: "remote" },
                encodedResult: { source: "remote" },
              }),
          }),
        ]).pipe(Layer.provide(toolkit.toLayer({ lookup: ({ id }) => Effect.succeed({ source: "toolkit", id }) }))),
        ToolContext.layerDefault,
      ),
      Effect.gen(function* () {
        const executor = yield* ToolExecutor.ToolExecutor
        const lookup = yield* executor.execute(request("lookup", { id: "local" }))
        const remote = yield* executor.execute(request("remote", {}))
        const missing = yield* executor.execute(request("missing", {}))

        expect(lookup).toEqual({
          _tag: "Success",
          result: { source: "toolkit", id: "local" },
          encodedResult: { source: "toolkit", id: "local" },
        })
        expect(remote).toEqual({
          _tag: "Success",
          result: { source: "remote" },
          encodedResult: { source: "remote" },
        })
        expect(missing).toEqual({ _tag: "Failure", message: "Tool missing is not registered" })
      }),
    ] as const
  })

  ItLayer.make(it, "ToolExecutor.client validates placement results against the Effect AI tool schema", () => {
    const selectFile = Tool.make("select_file", {
      parameters: Schema.Struct({}),
      success: Schema.Struct({ name: Schema.String, contents: Schema.String }),
    })
    const toolkit = Toolkit.make(selectFile)

    return [
      Layer.mergeAll(
        ToolExecutor.router([
          ToolExecutor.client({
            toolkit,
            execute: ({ call }) =>
              Effect.succeed(
                "invalid" in (call.params as Record<string, unknown>)
                  ? { _tag: "Success", result: { name: 123, contents: "bad" } }
                  : { _tag: "Success", result: { name: "notes.txt", contents: "hello" } },
              ),
          }),
        ]),
        ToolContext.layerDefault,
      ),
      Effect.gen(function* () {
        const executor = yield* ToolExecutor.ToolExecutor
        const success = yield* executor.execute(request("select_file", {}))
        const invalid = yield* executor.execute(request("select_file", { invalid: true }))

        expect(success).toEqual({
          _tag: "Success",
          result: { name: "notes.txt", contents: "hello" },
          encodedResult: { name: "notes.txt", contents: "hello" },
        })
        expect(invalid._tag).toBe("Failure")
        expect(invalid._tag === "Failure" && invalid.message).toContain("invalid client result")
      }),
    ] as const
  })

  ItLayer.make(it, "ToolExecutor.remote ignores legacy schedules unless retry safety is explicit", () => {
    const runCi = Tool.make("run_ci", {
      parameters: Schema.Struct({}),
      success: Schema.Struct({ status: Schema.String }),
    })
    const toolkit = Toolkit.make(runCi)
    let attempts = 0

    return [
      Layer.mergeAll(
        ToolExecutor.router([
          ToolExecutor.remote({
            toolkit,
            schedule: Schedule.recurs(1),
            execute: (): Effect.Effect<ToolExecutor.PlacementResponse, string> => {
              attempts += 1
              return Effect.fail("network unavailable")
            },
          }),
        ]),
        ToolContext.layerDefault,
      ),
      Effect.gen(function* () {
        const executor = yield* ToolExecutor.ToolExecutor
        const failed = yield* executor.execute(request("run_ci", {}))

        expect(attempts).toBe(1)
        expect(failed._tag).toBe("Failure")
        expect(failed._tag === "Failure" && failed.message).toContain("network unavailable")
      }),
    ] as const
  })

  ItLayer.make(it, "ToolExecutor.remote deduplicates commit-then-response-loss retries by one operation key", () => {
    const charge = Tool.make("charge", {
      parameters: Schema.Struct({ amount: Schema.Finite }),
      success: Schema.Struct({ receipt: Schema.String }),
    })
    const toolkit = Toolkit.make(charge)
    const commits = new Set<string>()
    const observedKeys: Array<string> = []
    let attempts = 0

    return [
      Layer.mergeAll(
        ToolExecutor.router([
          ToolExecutor.remote({
            toolkit,
            retrySafe: true,
            operationKey: ({ call, sessionId }) => `${sessionId}:${call.id}`,
            maxRetries: 2,
            schedule: Schedule.forever,
            execute: ({ operationKey }): Effect.Effect<ToolExecutor.PlacementResponse, string> =>
              Effect.gen(function* () {
                attempts += 1
                observedKeys.push(operationKey)
                commits.add(operationKey)
                if (attempts === 1) return yield* Effect.fail("response lost")
                return { _tag: "Success", result: { receipt: "receipt-1" } }
              }),
          }),
        ]),
        ToolContext.layerDefault,
      ),
      Effect.gen(function* () {
        const executor = yield* ToolExecutor.ToolExecutor
        const outcome = yield* executor.execute(request("charge", { amount: 10 }))

        expect(outcome).toEqual({
          _tag: "Success",
          result: { receipt: "receipt-1" },
          encodedResult: { receipt: "receipt-1" },
        })
        expect(attempts).toBe(2)
        expect(observedKeys).toEqual(["session-1:call-charge", "session-1:call-charge"])
        expect(commits.size).toBe(1)
      }),
    ] as const
  })

  ItLayer.make(
    it,
    "ToolExecutor.remote rejects empty and changing operation keys before another remote attempt",
    () => {
      const lookup = Tool.make("lookup", {
        parameters: Schema.Struct({}),
        success: Schema.String,
      })
      const toolkit = Toolkit.make(lookup)
      let changingKey = 0
      let emptyAttempts = 0
      let changingAttempts = 0
      const empty = ToolExecutor.remote({
        toolkit,
        retrySafe: true,
        operationKey: () => " ",
        maxRetries: 1,
        schedule: Schedule.recurs(1),
        execute: () => {
          emptyAttempts += 1
          return Effect.fail("unavailable")
        },
      })
      const changing = ToolExecutor.remote({
        toolkit,
        retrySafe: true,
        operationKey: () => `lookup-${changingKey++}`,
        maxRetries: 1,
        schedule: Schedule.recurs(1),
        execute: () => {
          changingAttempts += 1
          return Effect.fail("unavailable")
        },
      })

      return [
        ToolContext.layerDefault,
        Effect.gen(function* () {
          const emptyError = yield* Effect.flip(empty.execute(request("lookup", {})))
          const changingError = yield* Effect.flip(changing.execute(request("lookup", {})))

          expect(Schema.is(ToolExecutor.RemoteRetryError)(emptyError)).toBe(true)
          expect(Schema.is(ToolExecutor.RemoteRetryError)(changingError)).toBe(true)
          expect(emptyAttempts).toBe(0)
          expect(changingAttempts).toBe(1)
        }),
      ] as const
    },
  )

  ItLayer.make(it, "ToolExecutor.remote validates a retry key immediately before the next attempt", () => {
    const lookup = Tool.make("lookup", {
      parameters: Schema.Struct({}),
      success: Schema.String,
    })
    const toolkit = Toolkit.make(lookup)
    let operationKey = "lookup-1"
    let attempts = 0

    return [
      ToolContext.layerDefault,
      Effect.gen(function* () {
        const firstAttempt = yield* Deferred.make<void>()
        const remote = ToolExecutor.remote({
          toolkit,
          retrySafe: true,
          operationKey: () => operationKey,
          maxRetries: 1,
          schedule: Schedule.spaced("1 hour"),
          execute: () => {
            attempts += 1
            return Deferred.succeed(firstAttempt, undefined).pipe(Effect.andThen(Effect.fail("response lost")))
          },
        })
        const fiber = yield* remote.execute(request("lookup", {})).pipe(Effect.forkChild)
        yield* Deferred.await(firstAttempt)
        operationKey = "lookup-2"
        yield* TestClock.adjust("1 hour")
        const error = yield* Fiber.join(fiber).pipe(Effect.flip)

        expect(Schema.is(ToolExecutor.RemoteRetryError)(error)).toBe(true)
        expect(attempts).toBe(1)
      }),
    ] as const
  })

  ItLayer.make(it, "ToolExecutor.remote accepts zero retries and rejects invalid retry bounds", () => {
    const lookup = Tool.make("lookup", {
      parameters: Schema.Struct({}),
      success: Schema.String,
    })
    const toolkit = Toolkit.make(lookup)
    let keyEvaluations = 0
    let attempts = 0
    const noRetries = ToolExecutor.remote({
      toolkit,
      retrySafe: true,
      operationKey: () => `lookup-${keyEvaluations++}`,
      maxRetries: 0,
      schedule: Schedule.forever,
      execute: () => {
        attempts += 1
        return Effect.fail("unavailable")
      },
    })
    const invalidBound = ToolExecutor.remote({
      toolkit,
      retrySafe: true,
      operationKey: () => "lookup-1",
      maxRetries: Number.POSITIVE_INFINITY,
      schedule: Schedule.forever,
      execute: () => {
        attempts += 1
        return Effect.fail("unavailable")
      },
    })

    return [
      ToolContext.layerDefault,
      Effect.gen(function* () {
        const outcome = yield* noRetries.execute(request("lookup", {}))
        const error = yield* invalidBound.execute(request("lookup", {})).pipe(Effect.flip)

        expect(outcome._tag).toBe("Failure")
        expect(keyEvaluations).toBe(1)
        expect(attempts).toBe(1)
        expect(Schema.is(ToolExecutor.RemoteRetryError)(error)).toBe(true)
        expect(Schema.is(ToolExecutor.RemoteRetryError)(error) && error.reason).toBe("invalid-max-retries")
      }),
    ] as const
  })

  ItLayer.make(it, "ToolExecutor.remote bounds retries and excludes outcomes, defects, and interruption", () => {
    const lookup = Tool.make("lookup", {
      parameters: Schema.Struct({ mode: Schema.String }),
      success: Schema.String,
    })
    const toolkit = Toolkit.make(lookup)
    const attempts: Record<string, number> = {}
    const remote = ToolExecutor.remote({
      toolkit,
      retrySafe: true,
      operationKey: ({ call }) => call.id,
      maxRetries: 2,
      schedule: Schedule.forever,
      execute: ({ call }): Effect.Effect<ToolExecutor.PlacementResponse, string | AgentEvent.AgentError> => {
        const mode = (call.params as { readonly mode: string }).mode
        attempts[mode] = (attempts[mode] ?? 0) + 1
        if (mode === "domain") return Effect.succeed({ _tag: "Failure", message: "not found" })
        if (mode === "success") return Effect.succeed({ _tag: "Success", result: "found" })
        if (mode === "defect") return Effect.die("broken adapter")
        if (mode === "interrupt") return Effect.interrupt
        if (mode === "framework") return Effect.fail(AgentEvent.AgentError.make({ message: "invalid route", turn: 0 }))
        return Effect.fail("unavailable")
      },
    })

    return [
      ToolContext.layerDefault,
      Effect.gen(function* () {
        const domain = yield* remote.execute(request("lookup", { mode: "domain" }))
        const success = yield* remote.execute(request("lookup", { mode: "success" }))
        const defect = yield* remote.execute(request("lookup", { mode: "defect" })).pipe(Effect.exit)
        const interruption = yield* remote.execute(request("lookup", { mode: "interrupt" })).pipe(Effect.exit)
        const framework = yield* remote.execute(request("lookup", { mode: "framework" }))
        const exhausted = yield* remote.execute(request("lookup", { mode: "infrastructure" }))

        expect(domain).toEqual({ _tag: "Failure", message: "not found" })
        expect(success).toEqual({ _tag: "Success", result: "found", encodedResult: "found" })
        expect(Exit.isSuccess(defect)).toBe(true)
        expect(Exit.hasInterrupts(interruption)).toBe(true)
        expect(framework._tag).toBe("Failure")
        expect(exhausted._tag).toBe("Failure")
        expect(attempts).toEqual({ domain: 1, success: 1, defect: 1, interrupt: 1, framework: 1, infrastructure: 3 })
      }),
    ] as const
  })

  ItLayer.make(it, "ToolExecutor.mcp and sandbox are placement routes over Effect AI tool names", () => {
    const githubSearch = Tool.make("github_search", {
      parameters: Schema.Struct({ query: Schema.String }),
      success: Schema.Struct({ source: Schema.String }),
    })
    const shell = Tool.make("shell", {
      parameters: Schema.Struct({ command: Schema.String }),
      success: Schema.Struct({ source: Schema.String }),
    })

    return [
      Layer.mergeAll(
        ToolExecutor.router([
          ToolExecutor.mcp({
            toolkit: Toolkit.make(githubSearch),
            execute: () => Effect.succeed({ _tag: "Success", result: { source: "mcp" } }),
          }),
          ToolExecutor.sandbox({
            toolkit: Toolkit.make(shell),
            execute: () => Effect.succeed({ _tag: "Success", result: { source: "sandbox" } }),
          }),
        ]),
        ToolContext.layerDefault,
      ),
      Effect.gen(function* () {
        const executor = yield* ToolExecutor.ToolExecutor
        const mcp = yield* executor.execute(request("github_search", { query: "baton" }))
        const sandbox = yield* executor.execute(request("shell", { command: "pwd" }))

        expect(mcp).toEqual({ _tag: "Success", result: { source: "mcp" }, encodedResult: { source: "mcp" } })
        expect(sandbox).toEqual({
          _tag: "Success",
          result: { source: "sandbox" },
          encodedResult: { source: "sandbox" },
        })
      }),
    ] as const
  })

  ItLayer.make(it, "exposes a child agent as a parent tool", () => {
    let parentCalls = 0
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          const content = Json.stringify(options.prompt.content)
          if (activeToolNames(options).length === 0 && content.includes("child task")) {
            return Stream.make(textDelta("child answer"))
          }
          parentCalls += 1
          return parentCalls === 1
            ? Stream.make(toolCallPart("call-child", "ask_child", { prompt: "child task" }))
            : Stream.make(textDelta("parent saw child answer"))
        }),
        ToolExecutor.fromToolkit(AgentTool.asTool(Agent.make({ name: "child" }), { name: "ask_child" })),
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const child = Agent.make({ name: "child" })
        const childTool = AgentTool.asTool(child, { name: "ask_child" })
        const parent = Agent.make({ name: "parent", toolkit: Toolkit.make(childTool.tools.ask_child) })

        const events = yield* Stream.runCollect(Agent.stream(parent, { prompt: "parent task" }))

        const toolCompleted = events.find((event) => event._tag === "ToolExecutionCompleted")
        expect(toolCompleted?._tag === "ToolExecutionCompleted" && toolCompleted.result.result).toBe("child answer")
        const completed = events.at(-1)
        expect(completed?._tag === "Completed" && completed.text).toBe("parent saw child answer")
      }),
    ] as const
  })

  ItLayer.make(it, "returns child suspension as a failed parent tool result", () => {
    let parentCalls = 0
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          const content = Json.stringify(options.prompt.content)
          if (activeToolNames(options).includes("gated") && content.includes("child approval task")) {
            return Stream.make(toolCallPart("call-gated", "gated", { text: "hold" }))
          }
          parentCalls += 1
          return parentCalls === 1
            ? Stream.make(toolCallPart("call-reviewer", "ask_reviewer", { prompt: "child approval task" }))
            : Stream.make(textDelta("parent saw reviewer failure"))
        }),
        ToolExecutor.fromToolkit(
          AgentTool.asTool(Agent.make({ name: "reviewer", toolkit: Toolkit.make(gatedTool) }), {
            name: "ask_reviewer",
          }),
        ),
        Approvals.testLayer({ check: () => Effect.succeed({ _tag: "Pending", token: "approval-1" }) }),
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const child = Agent.make({ name: "reviewer", toolkit: Toolkit.make(gatedTool) })
        const childTool = AgentTool.asTool(child, { name: "ask_reviewer" })
        const parent = Agent.make({ name: "parent", toolkit: Toolkit.make(childTool.tools.ask_reviewer) })

        const events = yield* Stream.runCollect(Agent.stream(parent, { prompt: "parent task" }))

        const toolCompleted = events.find((event) => event._tag === "ToolExecutionCompleted")
        expect(toolCompleted?._tag).toBe("ToolExecutionCompleted")
        if (toolCompleted?._tag === "ToolExecutionCompleted") {
          expect(toolCompleted.result.isFailure).toBe(true)
          expect(Json.stringify(toolCompleted.result.result)).toContain("sub-agent 'reviewer' could not complete")
          expect(Json.stringify(toolCompleted.result.result)).toContain("suspended on gated: approval")
        }
        const completed = events.at(-1)
        expect(completed?._tag === "Completed" && completed.text).toBe("parent saw reviewer failure")
        expect(parentCalls).toBe(2)
      }),
    ] as const
  })

  ItLayer.make(it, "honors parameter and result mapping overrides", () => {
    let parentCalls = 0
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          const content = Json.stringify(options.prompt.content)
          if (content.includes("custom prompt")) return Stream.make(textDelta("custom answer"))
          parentCalls += 1
          return parentCalls === 1
            ? Stream.make(toolCallPart("call-custom", "ask_custom", { question: "custom prompt" }))
            : Stream.make(textDelta("parent done"))
        }),
        ToolExecutor.fromToolkit(
          AgentTool.asTool(Agent.make({ name: "custom-child" }), {
            name: "ask_custom",
            parameters: Schema.Struct({ question: Schema.String }),
            success: Schema.Struct({ answer: Schema.String }),
            toPrompt: (params) => params.question,
            fromResult: (result) => ({ answer: result.text }),
          }),
        ),
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const child = Agent.make({ name: "custom-child" })
        const childTool = AgentTool.asTool(child, {
          name: "ask_custom",
          parameters: Schema.Struct({ question: Schema.String }),
          success: Schema.Struct({ answer: Schema.String }),
          toPrompt: (params) => params.question,
          fromResult: (result) => ({ answer: result.text }),
        })
        const parent = Agent.make({ name: "parent", toolkit: Toolkit.make(childTool.tools.ask_custom) })

        const events = yield* Stream.runCollect(Agent.stream(parent, { prompt: "parent task" }))

        const toolCompleted = events.find((event) => event._tag === "ToolExecutionCompleted")
        expect(toolCompleted?._tag === "ToolExecutionCompleted" && toolCompleted.result.result).toEqual({
          answer: "custom answer",
        })
      }),
    ] as const
  })
})
