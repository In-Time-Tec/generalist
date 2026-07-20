import { expect, layer } from "@effect/vitest"
import { Json } from "./json"
import { Context, Deferred, Effect, Exit, Fiber, Layer, Schedule, Schema, Stream } from "effect"
import { TestClock } from "effect/testing"
import { AiError, LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import {
  Agent,
  AgentEvent,
  AgentTool,
  Approvals,
  Memory,
  ModelMiddleware,
  ToolContext,
  ToolExecutor,
  ToolPlacement,
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

const request = (name: string, params: unknown): ToolExecutor.Request => {
  const call = toolCallPart(`call-${name}`, name, params)
  return {
    call,
    toolCallBatch: { calls: [call] },
    turn: 0,
    toolCallIndex: 0,
    agentName: "tool-executor-test",
    sessionId: "session-1",
  }
}

const gatedTool = Tool.make("gated", {
  description: "Needs child approval",
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.String,
  needsApproval: true,
})

class AuthorizationDependency extends Context.Service<AuthorizationDependency, string>()(
  "@batonfx/core/test/agent-tool.test/AuthorizationDependency",
) {}

layer(unusedToolHandlerLayer)("AgentTool", (it) => {
  expect(agentToolRequirementProof).toBe(true)

  ItLayer.make(it, "ToolExecutor.layerToolkit preserves decoded and encoded declared failures", () => {
    const failingTool = Tool.make("failing", {
      parameters: Schema.Struct({}),
      success: Schema.String,
      failure: Schema.Struct({ code: Schema.FiniteFromString, detail: Schema.String }),
      failureMode: "return",
    })
    const toolkit = Toolkit.make(failingTool)
    const handlers = toolkit.toLayer({ failing: () => Effect.fail({ code: 409, detail: "child failed" }) })
    return [
      Layer.mergeAll(
        handlers,
        ToolExecutor.layerToolkit(toolkit).pipe(Layer.provide(handlers)),
        ToolContext.layerDefault,
      ),
      Effect.gen(function* () {
        const outcome = yield* ToolExecutor.ToolExecutor.use((executor) => executor.execute(request("failing", {})))

        expect(outcome).toEqual({
          _tag: "DomainFailure",
          failure: { code: 409, detail: "child failed" },
          encodedFailure: { code: "409", detail: "child failed" },
        })
      }),
    ] as const
  })

  ItLayer.make(it, "ToolExecutor.layerToolkit uses the failure encoding when decoded schemas overlap", () => {
    const overlappingTool = Tool.make("overlapping_failure", {
      parameters: Schema.Struct({}),
      success: Schema.FiniteFromString,
      failure: Schema.Finite,
      failureMode: "return",
    })
    const toolkit = Toolkit.make(overlappingTool)
    const handlers = toolkit.toLayer({ overlapping_failure: () => Effect.fail(409) })
    return [
      Layer.mergeAll(
        handlers,
        ToolExecutor.layerToolkit(toolkit).pipe(Layer.provide(handlers)),
        ToolContext.layerDefault,
      ),
      Effect.gen(function* () {
        const outcome = yield* ToolExecutor.ToolExecutor.use((executor) =>
          executor.execute(request("overlapping_failure", {})),
        )

        expect(outcome).toEqual({ _tag: "DomainFailure", failure: 409, encodedFailure: 409 })
      }),
    ] as const
  })

  ItLayer.make(it, "ToolExecutor.layerToolkit preserves error-mode declared failures", () => {
    const failingTool = Tool.make("failing_error_mode", {
      parameters: Schema.Struct({}),
      success: Schema.String,
      failure: Schema.Struct({ code: Schema.FiniteFromString }),
    })
    const toolkit = Toolkit.make(failingTool)
    const handlers = toolkit.toLayer({ failing_error_mode: () => Effect.fail({ code: 503 }) })
    return [
      Layer.mergeAll(
        handlers,
        ToolExecutor.layerToolkit(toolkit).pipe(Layer.provide(handlers)),
        ToolContext.layerDefault,
      ),
      Effect.gen(function* () {
        const outcome = yield* ToolExecutor.ToolExecutor.use((executor) =>
          executor.execute(request("failing_error_mode", {})),
        )

        expect(outcome).toEqual({
          _tag: "DomainFailure",
          failure: { code: 503 },
          encodedFailure: { code: "503" },
        })
      }),
    ] as const
  })

  ItLayer.make(it, "ToolExecutor reports decode-input and missing-handler framework stages", () => {
    const lookupTool = Tool.make("lookup_stages", {
      parameters: Schema.Struct({ id: Schema.String }),
      success: Schema.String,
    })
    const toolkit = Toolkit.make(lookupTool)
    let handled = false
    const handlers = toolkit.toLayer({
      lookup_stages: () => {
        handled = true
        return Effect.succeed("found")
      },
    })
    return [
      Layer.mergeAll(
        handlers,
        ToolExecutor.layerToolkit(toolkit).pipe(Layer.provide(handlers)),
        ToolContext.layerDefault,
      ),
      Effect.gen(function* () {
        const executor = yield* ToolExecutor.ToolExecutor
        const decode = yield* Effect.flip(executor.execute(request("lookup_stages", { id: 1 })))
        const missing = yield* Effect.flip(executor.execute(request("missing_handler", {})))

        expect(decode).toMatchObject({ stage: "decode-input", tool: "lookup_stages" })
        expect(missing).toMatchObject({ stage: "missing-handler", tool: "missing_handler" })
        expect(handled).toBe(false)
      }),
    ] as const
  })

  ItLayer.make(it, "ToolExecutor reports invalid handler results as framework failures", () => {
    const failingTool = Tool.make("undeclared_failure", {
      parameters: Schema.Struct({}),
      success: Schema.String,
      failure: Schema.Struct({ code: Schema.Finite }),
    })
    const toolkit = Toolkit.make(failingTool)
    const handlers = toolkit.toLayer({
      undeclared_failure: () =>
        Effect.fail(
          AiError.make({
            module: "test",
            method: "undeclared_failure",
            reason: AiError.InvalidToolResultError.make({
              toolName: "undeclared_failure",
              description: "unexpected handler failure",
            }),
          }),
        ),
    })
    return [
      Layer.mergeAll(
        handlers,
        ToolExecutor.layerToolkit(toolkit).pipe(Layer.provide(handlers)),
        ToolContext.layerDefault,
      ),
      Effect.gen(function* () {
        const failure = yield* ToolExecutor.ToolExecutor.use((executor) =>
          executor.execute(request("undeclared_failure", {})),
        ).pipe(Effect.flip)

        expect(failure).toMatchObject({ stage: "handler", tool: "undeclared_failure" })
      }),
    ] as const
  })

  ItLayer.make(it, "ToolExecutor.layerToolkit preserves handler interruptions", () => {
    const interruptingTool = Tool.make("interrupting", {
      parameters: Schema.Struct({}),
      success: Schema.String,
    })
    const toolkit = Toolkit.make(interruptingTool)
    const handlers = toolkit.toLayer({ interrupting: () => Effect.interrupt })
    return [
      Layer.mergeAll(
        handlers,
        ToolExecutor.layerToolkit(toolkit).pipe(Layer.provide(handlers)),
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

  ItLayer.make(it, "ToolExecutor.layerToolkit preserves handler defects", () => {
    const defectiveTool = Tool.make("defective", {
      parameters: Schema.Struct({}),
      success: Schema.String,
    })
    const toolkit = Toolkit.make(defectiveTool)
    const handlers = toolkit.toLayer({ defective: () => Effect.die("handler defect") })
    return [
      Layer.mergeAll(
        handlers,
        ToolExecutor.layerToolkit(toolkit).pipe(Layer.provide(handlers)),
        ToolContext.layerDefault,
      ),
      Effect.gen(function* () {
        const exit = yield* ToolExecutor.ToolExecutor.use((executor) =>
          executor.execute(request("defective", {})),
        ).pipe(Effect.exit)

        expect(Exit.hasDies(exit)).toBe(true)
      }),
    ] as const
  })

  ItLayer.make(it, "ToolExecutor.layerRouter dispatches named routes without redefining tools", () => {
    const lookupTool = Tool.make("lookup", {
      parameters: Schema.Struct({ id: Schema.String }),
      success: Schema.Struct({ source: Schema.String, id: Schema.String }),
    })
    const toolkit = Toolkit.make(lookupTool)

    return [
      Layer.mergeAll(
        ToolExecutor.layerRouter([
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
        const missing = yield* Effect.flip(executor.execute(request("missing", {})))

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
        expect(missing).toMatchObject({
          _tag: "@batonfx/core/FrameworkFailure",
          stage: "route",
          tool: "missing",
        })
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
        ToolExecutor.layerRouter([
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
        const invalid = yield* Effect.flip(executor.execute(request("select_file", { invalid: true })))

        expect(success).toEqual({
          _tag: "Success",
          result: { name: "notes.txt", contents: "hello" },
          encodedResult: { name: "notes.txt", contents: "hello" },
        })
        expect(invalid).toMatchObject({
          _tag: "@batonfx/core/FrameworkFailure",
          stage: "encode-success",
          tool: "select_file",
        })
      }),
    ] as const
  })

  ItLayer.make(it, "ToolExecutor validates placement domain failures against the failure schema", () => {
    const deploy = Tool.make("deploy", {
      parameters: Schema.Struct({}),
      success: Schema.String,
      failure: Schema.Struct({ code: Schema.FiniteFromString }),
    })
    return [
      Layer.mergeAll(
        ToolExecutor.layerRouter([
          ToolExecutor.client({
            toolkit: Toolkit.make(deploy),
            execute: () => Effect.succeed({ _tag: "DomainFailure", failure: { code: "invalid" } }),
          }),
        ]),
        ToolContext.layerDefault,
      ),
      Effect.gen(function* () {
        const failure = yield* ToolExecutor.ToolExecutor.use((executor) =>
          executor.execute(request("deploy", {})),
        ).pipe(Effect.flip)

        expect(failure).toMatchObject({ stage: "encode-domain-failure", tool: "deploy" })
      }),
    ] as const
  })

  ItLayer.make(it, "ToolExecutor rejects invalid placement input before calling the adapter", () => {
    const deploy = Tool.make("deploy_input", {
      parameters: Schema.Struct({ id: Schema.String }),
      success: Schema.String,
    })
    let calls = 0
    return [
      Layer.mergeAll(
        ToolExecutor.layerRouter([
          ToolExecutor.client({
            toolkit: Toolkit.make(deploy),
            execute: () => {
              calls += 1
              return Effect.succeed({ _tag: "Success", result: "deployed" })
            },
          }),
        ]),
        ToolContext.layerDefault,
      ),
      Effect.gen(function* () {
        const failure = yield* ToolExecutor.ToolExecutor.use((executor) =>
          executor.execute(request("deploy_input", { id: 1 })),
        ).pipe(Effect.flip)

        expect(failure).toMatchObject({ stage: "decode-input", tool: "deploy_input" })
        expect(calls).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(it, "ToolExecutor.remote retries infrastructure failures without retrying tool failures", () => {
    const runCi = Tool.make("run_ci", {
      parameters: Schema.Struct({}),
      success: Schema.Struct({ status: Schema.String }),
      failure: Schema.Struct({ message: Schema.String }),
    })
    const toolkit = Toolkit.make(runCi)
    let attempts = 0

    return [
      Layer.mergeAll(
        ToolExecutor.layerRouter([
          ToolExecutor.remote({
            toolkit,
            idempotent: true,
            operationKey: ({ call }) => call.id,
            maxRetries: 1,
            schedule: Schedule.recurs(1),
            execute: ({ call }): Effect.Effect<ToolPlacement.PlacementResponse, string> =>
              Effect.gen(function* () {
                attempts += 1
                if ("toolFailure" in (call.params as Record<string, unknown>)) {
                  return { _tag: "DomainFailure", failure: { message: "ci failed" } }
                }
                if ("infrastructureFailure" in (call.params as Record<string, unknown>)) {
                  return yield* Effect.fail<string>("worker unavailable")
                }
                if (attempts === 1) {
                  return yield* Effect.fail<string>("network unavailable")
                }
                return { _tag: "Success", result: { status: "green" } }
              }),
          }),
        ]),
        ToolContext.layerDefault,
      ),
      Effect.gen(function* () {
        const executor = yield* ToolExecutor.ToolExecutor
        const recovered = yield* executor.execute(request("run_ci", {}))
        const failed = yield* executor.execute(request("run_ci", { toolFailure: true }))
        const infrastructure = yield* Effect.flip(executor.execute(request("run_ci", { infrastructureFailure: true })))

        expect(attempts).toBe(5)
        expect(recovered).toEqual({
          _tag: "Success",
          result: { status: "green" },
          encodedResult: { status: "green" },
        })
        expect(failed).toEqual({
          _tag: "DomainFailure",
          failure: { message: "ci failed" },
          encodedFailure: { message: "ci failed" },
        })
        expect(infrastructure).toMatchObject({ stage: "placement", tool: "run_ci" })
      }),
    ] as const
  })

  ItLayer.make(it, "ToolExecutor.remote ignores legacy schedules unless idempotency is explicit", () => {
    const runCi = Tool.make("run_ci", {
      parameters: Schema.Struct({}),
      success: Schema.Struct({ status: Schema.String }),
    })
    const toolkit = Toolkit.make(runCi)
    let attempts = 0

    return [
      Layer.mergeAll(
        ToolExecutor.layerRouter([
          ToolExecutor.remote({
            toolkit,
            schedule: Schedule.recurs(1),
            execute: (): Effect.Effect<ToolPlacement.PlacementResponse, string> => {
              attempts += 1
              return Effect.fail("network unavailable")
            },
          }),
        ]),
        ToolContext.layerDefault,
      ),
      Effect.gen(function* () {
        const executor = yield* ToolExecutor.ToolExecutor
        const failed = yield* Effect.flip(executor.execute(request("run_ci", {})))

        expect(attempts).toBe(1)
        expect(failed).toMatchObject({ stage: "placement", tool: "run_ci" })
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
        ToolExecutor.layerRouter([
          ToolExecutor.remote({
            toolkit,
            idempotent: true,
            operationKey: ({ call, sessionId }) => `${sessionId}:${call.id}`,
            maxRetries: 2,
            schedule: Schedule.forever,
            execute: ({ operationKey }): Effect.Effect<ToolPlacement.PlacementResponse, string> =>
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
        idempotent: true,
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
        idempotent: true,
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

          expect(Schema.is(ToolExecutor.RemoteRetryMisconfigured)(emptyError)).toBe(true)
          expect(Schema.is(ToolExecutor.RemoteRetryMisconfigured)(changingError)).toBe(true)
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
          idempotent: true,
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

        expect(Schema.is(ToolExecutor.RemoteRetryMisconfigured)(error)).toBe(true)
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
      idempotent: true,
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
      idempotent: true,
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
        const outcome = yield* Effect.flip(noRetries.execute(request("lookup", {})))
        const error = yield* invalidBound.execute(request("lookup", {})).pipe(Effect.flip)

        expect(outcome).toMatchObject({ stage: "placement", tool: "lookup" })
        expect(keyEvaluations).toBe(1)
        expect(attempts).toBe(1)
        expect(Schema.is(ToolExecutor.RemoteRetryMisconfigured)(error)).toBe(true)
        expect(Schema.is(ToolExecutor.RemoteRetryMisconfigured)(error) && error.reason).toBe("invalid-max-retries")
      }),
    ] as const
  })

  ItLayer.make(it, "ToolExecutor.remote bounds retries and excludes outcomes, defects, and interruption", () => {
    const lookup = Tool.make("lookup", {
      parameters: Schema.Struct({ mode: Schema.String }),
      success: Schema.String,
      failure: Schema.Struct({ message: Schema.String }),
    })
    const toolkit = Toolkit.make(lookup)
    const attempts: Record<string, number> = {}
    const remote = ToolExecutor.remote({
      toolkit,
      idempotent: true,
      operationKey: ({ call }) => call.id,
      maxRetries: 2,
      schedule: Schedule.forever,
      execute: ({ call }): Effect.Effect<ToolPlacement.PlacementResponse, string | AgentEvent.AgentError> => {
        const mode = (call.params as { readonly mode: string }).mode
        attempts[mode] = (attempts[mode] ?? 0) + 1
        if (mode === "domain") return Effect.succeed({ _tag: "DomainFailure", failure: { message: "not found" } })
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
        const framework = yield* Effect.flip(remote.execute(request("lookup", { mode: "framework" })))
        const exhausted = yield* Effect.flip(remote.execute(request("lookup", { mode: "infrastructure" })))

        expect(domain).toEqual({
          _tag: "DomainFailure",
          failure: { message: "not found" },
          encodedFailure: { message: "not found" },
        })
        expect(success).toEqual({ _tag: "Success", result: "found", encodedResult: "found" })
        expect(Exit.hasDies(defect)).toBe(true)
        expect(Exit.hasInterrupts(interruption)).toBe(true)
        expect(framework).toMatchObject({ stage: "placement", tool: "lookup" })
        expect(exhausted).toMatchObject({ stage: "placement", tool: "lookup" })
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
        ToolExecutor.layerRouter([
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

  ItLayer.make(
    it,
    "keeps concurrent executor outcomes associated with their calls",
    () =>
      [
        Layer.mergeAll(
          ToolExecutor.layerTest({
            execute: (input) =>
              Effect.succeed(
                input.call.name === "first"
                  ? { _tag: "Success", result: input.call.id, encodedResult: input.call.id }
                  : { _tag: "DomainFailure", failure: input.call.id, encodedFailure: input.call.id },
              ),
          }),
          ToolContext.layerDefault,
        ),
        Effect.gen(function* () {
          const executor = yield* ToolExecutor.ToolExecutor
          const outcomes = yield* Effect.all(
            [executor.execute(request("first", {})), executor.execute(request("second", {}))],
            { concurrency: 2 },
          )

          expect(outcomes).toEqual([
            { _tag: "Success", result: "call-first", encodedResult: "call-first" },
            { _tag: "DomainFailure", failure: "call-second", encodedFailure: "call-second" },
          ])
        }),
      ] as const,
  )

  ItLayer.make(it, "Agent emits decoded domain failures and re-feeds only their encoded value", () => {
    const failingTool = Tool.make("agent_failure", {
      parameters: Schema.Struct({}),
      success: Schema.String,
      failure: Schema.Struct({ code: Schema.FiniteFromString, detail: Schema.String }),
      failureMode: "return",
    })
    const toolkit = Toolkit.make(failingTool)
    const handlers = toolkit.toLayer({
      agent_failure: () => Effect.fail({ code: 422, detail: "invalid request" }),
    })
    let calls = 0
    let followUp = ""
    return [
      Layer.mergeAll(
        handlers,
        modelLayer((options) => {
          calls += 1
          if (calls === 1) return Stream.make(toolCallPart("call-agent-failure", "agent_failure", {}))
          followUp = Json.stringify(options.prompt.content)
          return Stream.make(textDelta("handled failure"))
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const events = yield* Stream.runCollect(
          Agent.stream(Agent.make({ name: "domain-failure-agent", toolkit }), { prompt: "fail" }),
        )
        const completed = events.find((event) => event._tag === "ToolExecutionCompleted")

        expect(completed?._tag === "ToolExecutionCompleted" && completed.result.result).toEqual({
          code: 422,
          detail: "invalid request",
        })
        expect(completed?._tag === "ToolExecutionCompleted" && completed.result.encodedResult).toEqual({
          code: "422",
          detail: "invalid request",
        })
        expect(followUp).toContain('"code":"422"')
        expect(followUp).not.toContain('"error"')
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
        ToolExecutor.layerToolkit(AgentTool.asTool(Agent.make({ name: "child" }), { name: "ask_child" })),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
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

  ItLayer.make(it, "preserves child authorization requirements", () => {
    let calls = 0
    let authorized = false
    const toolkit = Toolkit.make(gatedTool)
    const child = Agent.make({
      name: "authorized-child",
      toolkit,
      authorization: {
        authorize: () =>
          AuthorizationDependency.pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                authorized = true
              }),
            ),
            Effect.as({ _tag: "Execute" as const }),
          ),
      },
    })
    const childTool = AgentTool.asTool(child, { name: "ask_authorized_child" })
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(toolCallPart("authorized-call", "gated", { text: "run" }))
            : Stream.make(textDelta("authorized child answer"))
        }),
        ToolExecutor.layerRouter([ToolExecutor.routeToolkit(childTool), ToolExecutor.routeToolkit(toolkit)]).pipe(
          Layer.provide(toolkit.toLayer({ gated: ({ text }) => Effect.succeed(text) })),
        ),
        ToolContext.layerDefault,
        Layer.succeed(AuthorizationDependency, "available"),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const executor = yield* ToolExecutor.ToolExecutor
        const outcome = yield* executor.execute(request("ask_authorized_child", { prompt: "child task" }))

        expect(authorized).toBe(true)
        expect(outcome).toEqual({
          _tag: "Success",
          result: "authorized child answer",
          encodedResult: "authorized child answer",
        })
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
        ToolExecutor.layerToolkit(
          AgentTool.asTool(Agent.make({ name: "reviewer", toolkit: Toolkit.make(gatedTool) }), {
            name: "ask_reviewer",
          }),
        ),
        Approvals.layerTest({ resolve: (pending) => Effect.succeed({ ...pending, token: "approval-1" }) }),
        ModelMiddleware.layerIdentity,
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
        ToolExecutor.layerToolkit(
          AgentTool.asTool(Agent.make({ name: "custom-child" }), {
            name: "ask_custom",
            parameters: Schema.Struct({ question: Schema.String }),
            success: Schema.Struct({ answer: Schema.String }),
            toPrompt: (params) => params.question,
            fromResult: (result) => ({ answer: result.text }),
          }),
        ),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
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
