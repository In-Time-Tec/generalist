import { expect, it } from "@effect/vitest"
import { Effect, Layer, Stream } from "effect"
import { LanguageModel, Response, Toolkit } from "effect/unstable/ai"
import { layerAutoApprove } from "../../../approvals.js"
import { make as makeAgent } from "../../../core/agent/service.js"
import { fanOut as makeFanOut } from "../../../core/agent/tool.js"
import { make as makeBudget } from "../../../core/durable/run-budget.js"
import { layerAllowAll } from "../../../core/policy/permissions.js"
import { Runtime } from "../../../runtime/service.js"
import type { ChildRunsCapability, Options, Services } from "../contract.js"

type Prepare = <A, E>(effect: Effect.Effect<A, E>) => Effect.Effect<A, E>
type Open<LayerError> = <A, E>(use: (services: Services) => Effect.Effect<A, E>) => Effect.Effect<A, E | LayerError>

const usage = Response.Usage.make({
  inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
})
const finish = Response.makePart("finish", { reason: "stop", usage, response: undefined })
const slug = (value: string): string => value.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()

/** Register shared child-run recovery and budget expectations for one Runtime driver. */
export const registerChildRuns = <LayerError, ClaimsLayerError>(input: {
  readonly options: Options<LayerError, ClaimsLayerError>
  readonly capability: ChildRunsCapability
  readonly prepare: Prepare
  readonly open: Open<LayerError>
}): void => {
  const { capability, open, options, prepare } = input
  it.effect("reattaches a restarted parent to running children and rebuilds its shared budget from the journal", () => {
    const name = `driver-${slug(options.name)}-child-runs`
    const child = makeAgent({ name: `${name}-child` })
    const delegate = makeFanOut({
      name: "delegate_driver_work",
      description: "Delegate driver conformance work",
      agents: {
        worker: {
          agent: child,
          inherit: { history: "full", instructions: "own", sandbox: "fresh" },
        },
      },
      maxChildren: 4,
    })
    const parent = makeAgent({ name, toolkit: Toolkit.make(delegate) })
    let parentCalls = 0
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text" as const, text: "unused" }]),
        streamText: (modelOptions) => {
          if (!modelOptions.tools.some((tool) => tool.name === "delegate_driver_work")) return Stream.empty
          parentCalls += 1
          return parentCalls === 1
            ? Stream.fromIterable<Response.StreamPartEncoded>([
                Response.makePart("tool-call", {
                  id: "driver-child-runs-call",
                  name: "delegate_driver_work",
                  params: {
                    children: [
                      { agent: "worker", input: "first" },
                      { agent: "worker", input: "second" },
                    ],
                    concurrency: 2,
                    onFailure: "collect",
                  },
                  providerExecuted: false,
                }),
                Response.makePart("finish", { reason: "tool-calls", usage, response: undefined }),
              ])
            : Stream.fromIterable<Response.StreamPartEncoded>([
                Response.makePart("text-delta", { id: "done", delta: "parent recovered" }),
                finish,
              ])
        },
      }),
    )
    const environment = Layer.mergeAll(model, layerAllowAll, layerAutoApprove)
    const register = (runtime: Runtime["Service"]) =>
      Effect.scoped(
        Layer.build(environment).pipe(
          Effect.flatMap((context) => runtime.register(parent).pipe(Effect.provideContext(context))),
        ),
      )
    const start = (services: Services) =>
      Effect.gen(function* () {
        if (services.executor === undefined) return yield* Effect.die(`${options.name} child-runs requires RunExecutor`)
        yield* register(services.runtime)
        const handle = yield* services.runtime.start(parent, "delegate", {
          sessionId: `session:${name}`,
          idempotencyKey: `child-runs:${name}`,
          budget: makeBudget({ tokens: 100, children: 4 }),
        })
        yield* services.executor.execute(
          yield* capability.claim(services, { runId: handle.runId, workerId: "child-runs-before" }),
        )
        const inspection = yield* services.runtime.inspect(handle.runId)
        expect(inspection.status).toBe("waiting")
        expect(inspection.children).toHaveLength(2)
        return { runId: handle.runId, childRunIds: inspection.children.map((entry) => entry.childRunId) }
      })
    const recover = (
      services: Services,
      suspended: { readonly runId: string; readonly childRunIds: ReadonlyArray<string> },
      rebuilt: boolean,
    ) =>
      Effect.gen(function* () {
        if (services.executor === undefined) return yield* Effect.die(`${options.name} child-runs requires RunExecutor`)
        if (rebuilt) yield* register(services.runtime)
        expect(yield* services.runtime.inspect(suspended.runId)).toMatchObject({
          status: "waiting",
          children: [{ status: "queued" }, { status: "queued" }],
        })
        const recoveredHistory = yield* services.runtime.history({ runId: suspended.runId, limit: 100 })
        expect(recoveredHistory.filter((event) => event._tag === "ChildLinked").map((event) => event.inherit)).toEqual([
          {
            history: "full",
            tools: "attenuate",
            permissions: "inherit",
            sandbox: "fresh",
            instructions: "own",
            memory: "inherit",
          },
          {
            history: "full",
            tools: "attenuate",
            permissions: "inherit",
            sandbox: "fresh",
            instructions: "own",
            memory: "inherit",
          },
        ])
        for (const [index, runId] of suspended.childRunIds.entries()) {
          const claim = yield* capability.claim(services, { runId, workerId: `child-runs-child-${index}` })
          yield* services.store.complete({
            ...claim,
            result: {
              text: `child-${index}`,
              output: `child-${index}`,
              turns: 1,
              session: { sessionId: `session:${name}:child:${index}`, leafId: null },
            },
          })
        }
        expect(yield* services.runtime.inspect(suspended.runId)).toMatchObject({
          status: "running",
          budget: { tokens: 98, children: 2 },
          children: [{ status: "succeeded" }, { status: "succeeded" }],
        })
        const beforeResume = yield* services.runtime.history({ runId: suspended.runId, limit: 100 })
        expect(
          beforeResume.filter((event) => event._tag === "ChildLinked").map((event) => event.budget?.tokens),
        ).toEqual([24, 24])
        yield* services.executor.execute(
          yield* capability.claim(services, { runId: suspended.runId, workerId: "child-runs-after" }),
        )
        const finalInspection = yield* services.runtime.inspect(suspended.runId)
        expect(finalInspection).toMatchObject({
          status: "succeeded",
          budget: { tokens: 96, children: 2 },
        })
        const history = yield* services.runtime.history({ runId: suspended.runId, limit: 100 })
        expect(history.filter((event) => event._tag === "FanOutAdmitted")).toHaveLength(1)
        expect(history.filter((event) => event._tag === "FanOutJoined")).toHaveLength(1)
        expect(history.filter((event) => event._tag === "ToolExecutionCompleted")).toHaveLength(1)
      })

    if (capability.recovery === "rebuild") {
      return prepare(
        Effect.gen(function* () {
          const suspended = yield* open(start)
          yield* open((services) => recover(services, suspended, true))
        }).pipe(Effect.orDie),
      )
    }
    return prepare(
      open((services) => Effect.flatMap(start(services), (suspended) => recover(services, suspended, false))).pipe(
        Effect.orDie,
      ),
    )
  })
}
