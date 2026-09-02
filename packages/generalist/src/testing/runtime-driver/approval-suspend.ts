import { expect, it } from "@effect/vitest"
import { Effect, Layer, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { make as makeAgent } from "../../core/agent/service.js"
import { layerDurable, resolve as resolveApproval, type DurableRequest } from "../../approvals.js"
import { layerAllowAll, layerRuleStoreMemory, RuleStore } from "../../core/policy/permissions.js"
import { Runtime } from "../../runtime/service.js"
import type { ApprovalSuspendCapability, Options, Services } from "./contract.js"

type Provide<LayerError> = <A, E>(use: (services: Services) => Effect.Effect<A, E>) => Effect.Effect<A, E | LayerError>

const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

const slug = (value: string): string => value.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()

export const registerApprovalSuspend = <LayerError, ClaimsLayerError>(input: {
  readonly options: Options<LayerError, ClaimsLayerError>
  readonly capability: ApprovalSuspendCapability
  readonly provide: Provide<LayerError>
}): void => {
  const { capability, options, provide } = input
  it.effect("suspends for durable approval, recovers, and dispatches the tool exactly once", () => {
    const notifications: Array<DurableRequest> = []
    let modelCalls = 0
    let toolCalls = 0
    let remembered = false
    const write = Tool.make("approval_write", {
      parameters: Schema.Struct({ value: Schema.String }),
      success: Schema.String,
      needsApproval: true,
    })
    const toolkit = Toolkit.make(write)
    const agent = makeAgent({ name: `driver-${slug(options.name)}-approval-suspend`, toolkit })
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text" as const, text: "unused" }]),
        streamText: () => {
          modelCalls += 1
          return modelCalls === 1
            ? Stream.fromIterable<Response.StreamPartEncoded>([
                Response.makePart("tool-call", {
                  id: "approval-write-1",
                  name: "approval_write",
                  params: { value: "once" },
                  providerExecuted: false,
                }),
                finish,
              ])
            : Stream.fromIterable<Response.StreamPartEncoded>([
                Response.makePart("text-delta", { id: "done", delta: "approved" }),
                finish,
              ])
        },
      }),
    )
    const handlers = toolkit.toLayer({
      approval_write: ({ value }) =>
        Effect.sync(() => {
          toolCalls += 1
          return value
        }),
    })
    const environment = (runtime: Runtime["Service"]) =>
      Layer.mergeAll(
        model,
        handlers,
        layerAllowAll,
        layerRuleStoreMemory(),
        layerDurable({
          notify: (request) => Effect.sync(() => notifications.push(request)),
        }).pipe(Layer.provide(Layer.succeed(Runtime, runtime))),
      )
    const register = (runtime: Runtime["Service"]) =>
      Effect.scoped(
        Layer.build(environment(runtime)).pipe(
          Effect.flatMap((context) => runtime.register(agent).pipe(Effect.provideContext(context))),
        ),
      )
    const start = (services: Services) =>
      Effect.gen(function* () {
        if (services.executor === undefined)
          return yield* Effect.die(`${options.name} approval recovery requires RunExecutor`)
        yield* register(services.runtime)
        const handle = yield* services.runtime.start(agent, "write once after approval", {
          sessionId: `session:${slug(options.name)}:approval-suspend`,
          idempotencyKey: `approval-suspend:${slug(options.name)}`,
        })
        const claim = yield* capability.claim(services, { runId: handle.runId, workerId: "approval-before" })
        yield* services.executor.execute(claim)
        expect((yield* services.runtime.inspect(handle.runId)).status).toBe("waiting")
        expect(toolCalls).toBe(0)
        expect(notifications).toHaveLength(1)
        expect(notifications[0]).toMatchObject({
          runId: handle.runId,
          tool: "approval_write",
          args: { value: "once" },
          level: "allow",
          reason: "Tool requires approval",
        })
        return { runId: handle.runId, token: notifications[0]!.token }
      })
    const recover = (services: Services, suspended: { readonly runId: string; readonly token: string }) =>
      Effect.gen(function* () {
        if (services.executor === undefined)
          return yield* Effect.die(`${options.name} approval recovery requires RunExecutor`)
        yield* resolveApproval(suspended.token, {
          _tag: "Approved",
          remember: { pattern: "approval_write:*", level: "allow" },
        }).pipe(
          Effect.provideService(Runtime, services.runtime),
          Effect.provideService(
            RuleStore,
            RuleStore.of({
              rules: Effect.succeed([]),
              remember: () => Effect.sync(() => (remembered = true)),
            }),
          ),
        )
        expect(remembered).toBe(true)
        const claim = yield* capability.claim(services, {
          runId: suspended.runId,
          workerId: "approval-after",
        })
        yield* services.executor.execute(claim)
        expect((yield* services.runtime.inspect(suspended.runId)).status).toBe("succeeded")
        const history = yield* services.runtime.history({ runId: suspended.runId, limit: 100 })
        expect(history.filter((event) => event._tag === "ApprovalRequested")).toHaveLength(1)
        expect(history.filter((event) => event._tag === "ToolExecutionStarted")).toHaveLength(1)
        expect(history.filter((event) => event._tag === "ToolExecutionCompleted")).toHaveLength(1)
        expect(toolCalls).toBe(1)
      })

    if (capability.recovery === "rebuild") {
      return Effect.gen(function* () {
        const suspended = yield* provide(start)
        yield* provide((services) => recover(services, suspended))
      }).pipe(Effect.orDie)
    }
    // oxlint-disable-next-line effecttsgo/any-unknown-in-error-context -- LayerError is selected by each driver and is terminated below at the test boundary.
    return provide((services) => Effect.flatMap(start(services), (suspended) => recover(services, suspended))).pipe(
      Effect.orDie,
    )
  })
}
