import { expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { make as makeAgent } from "../../../core/agent/service.js"
import { layerAutoApprove } from "../../../core/policy/approvals.js"
import { layerAllowAll } from "../../../core/policy/permissions.js"
import type { ForkRewindCapability, Options, Services } from "../contract.js"

interface Registration<LayerError, ClaimsLayerError> {
  readonly options: Options<LayerError, ClaimsLayerError>
  readonly capability: ForkRewindCapability
  readonly prepare: <A, E>(effect: Effect.Effect<A, E>) => Effect.Effect<A, E>
  readonly open: <A, E>(use: (services: Services) => Effect.Effect<A, E>) => Effect.Effect<A, E | LayerError>
}

const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

const slug = (value: string): string => value.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()
const jsonText = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))
const awaitTerminal = (services: Services, runId: string) =>
  Effect.gen(function* () {
    let inspection = yield* services.runtime.inspect(runId)
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (inspection.status === "succeeded" || inspection.status === "failed" || inspection.status === "cancelled")
        return inspection
      yield* Effect.sleep("50 millis")
      inspection = yield* services.runtime.inspect(runId)
    }
    return inspection
  })

const gapFree = (path: ReadonlyArray<{ readonly id: string; readonly parentId: string | null }>): boolean =>
  path.every((entry, index) => entry.parentId === (path[index - 1]?.id ?? null))

/** Register the fork and rewind contract at a committed `TurnCompleted` checkpoint. */
export const registerTurnCompletedTransition = <LayerError, ClaimsLayerError>(
  registration: Registration<LayerError, ClaimsLayerError>,
): void => {
  const { capability, open, options, prepare } = registration

  it.effect("resumes a fork and a rewind at a committed TurnCompleted checkpoint", () => {
    const name = slug(options.name)
    const sessionId = `session:conformance:${name}:turn-completed-transition`
    let modelCalls = 0
    let toolCalls = 0
    const lookup = Tool.make("turn_boundary_lookup", {
      parameters: Schema.Struct({ key: Schema.String }),
      success: Schema.String,
    })
    const toolkit = Toolkit.make(lookup)
    const agent = makeAgent({ name: `driver-${name}-turn-completed-transition`, toolkit })
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text" as const, text: "unused" }]),
        streamText: () => {
          modelCalls += 1
          if (modelCalls === 1) {
            return Stream.fromIterable<Response.StreamPartEncoded>([
              Response.makePart("tool-call", {
                id: "turn-boundary-lookup-1",
                name: "turn_boundary_lookup",
                params: { key: "status" },
                providerExecuted: false,
              }),
              finish,
            ])
          }
          let text = "rewound follow-up"
          if (modelCalls === 2) text = "source future"
          else if (modelCalls === 3) text = "fork future"
          return Stream.fromIterable<Response.StreamPartEncoded>([
            Response.makePart("text-delta", { id: `turn-boundary-${modelCalls}`, delta: text }),
            finish,
          ])
        },
      }),
    )
    const handlers = toolkit.toLayer({
      turn_boundary_lookup: ({ key }) =>
        Effect.sync(() => {
          toolCalls += 1
          return key === "status" ? "original-blue" : "unknown"
        }),
    })
    const environment = Layer.mergeAll(model, handlers, layerAllowAll, layerAutoApprove)
    const register = (runtime: Services["runtime"]) =>
      Effect.scoped(
        Layer.build(environment).pipe(
          Effect.flatMap((context) => runtime.register(agent).pipe(Effect.provideContext(context))),
        ),
      )

    const scenario = (services: Services) =>
      Effect.gen(function* () {
        if (services.executor === undefined) {
          return yield* Effect.die(`${options.name} turn-completed transition requires RunExecutor`)
        }
        yield* register(services.runtime)
        const handle = yield* services.runtime.start(agent, "Look up the status.", {
          sessionId,
          idempotencyKey: `turn-completed-transition:${name}`,
        })
        yield* services.executor.execute(
          yield* capability.claim(services, { runId: handle.runId, commandId: "turn-completed-source" }),
        )
        const sourceInspection = yield* awaitTerminal(services, handle.runId)
        const sourceHistory = yield* services.runtime.history({ runId: handle.runId, limit: 100 })
        const sourceTerminal = sourceHistory.findLast(
          (event) => event._tag === "RunCompleted" || event._tag === "RunFailed" || event._tag === "RunCancelled",
        )
        expect(sourceInspection.status, jsonText(sourceTerminal)).toBe("succeeded")
        const completedTool = sourceHistory.find((event) => event._tag === "ToolExecutionCompleted")
        const turnCompleted = sourceHistory.find((event) => event._tag === "TurnCompleted")
        if (completedTool?._tag !== "ToolExecutionCompleted" || turnCompleted?._tag !== "TurnCompleted") {
          return yield* Effect.die("source run did not record a completed tool and turn boundary")
        }
        expect(turnCompleted.sequence).toBeGreaterThan(completedTool.sequence)

        const forked = yield* services.runtime.fork(handle.runId, {
          commandId: "turn-completed-fork",
          atSequence: turnCompleted.sequence,
        })
        yield* services.executor.execute(
          yield* capability.claim(services, { runId: forked.runId, commandId: "turn-completed-fork-execute" }),
        )
        const forkInspection = yield* awaitTerminal(services, forked.runId)
        const forkHistory = yield* services.runtime.history({ runId: forked.runId, limit: 100 })
        const forkTerminal = forkHistory.findLast(
          (event) => event._tag === "RunCompleted" || event._tag === "RunFailed" || event._tag === "RunCancelled",
        )
        expect(forkInspection.status, jsonText(forkTerminal)).toBe("succeeded")
        expect(toolCalls).toBe(1)
        expect(modelCalls).toBe(3)

        yield* services.runtime.rewind(handle.runId, {
          commandId: "turn-completed-rewind",
          toSequence: turnCompleted.sequence,
        })
        yield* handle.send("Continue with the exact suffix REWOUND-TURN-BOUNDARY.", { policy: "steer" })
        yield* services.executor.execute(
          yield* capability.claim(services, { runId: handle.runId, commandId: "turn-completed-rewind-execute" }),
        )
        const inspection = yield* awaitTerminal(services, handle.runId)
        const rewoundHistory = yield* services.runtime.history({ runId: handle.runId, limit: 100 })
        const terminal = rewoundHistory.findLast(
          (event) => event._tag === "RunCompleted" || event._tag === "RunFailed" || event._tag === "RunCancelled",
        )
        expect(inspection.status, jsonText(terminal)).toBe("succeeded")
        expect(toolCalls).toBe(1)
        expect(modelCalls).toBe(4)
        expect(inspection.branches.some((branch) => branch.runId === forked.runId)).toBe(true)
        const sourceSession = Option.getOrThrow(yield* services.store.sessionReader(sessionId))
        const sourcePath = yield* sourceSession.path()
        expect(gapFree(sourcePath)).toBe(true)
        expect(jsonText(sourcePath)).toContain("REWOUND-TURN-BOUNDARY")
        return {
          forkRunId: forked.runId,
          source: sourcePath.map((entry) => entry.id),
          sourceRunId: handle.runId,
        }
      })

    const verify = (
      services: Services,
      result: { readonly forkRunId: string; readonly source: ReadonlyArray<string>; readonly sourceRunId: string },
    ) =>
      Effect.gen(function* () {
        expect((yield* services.runtime.inspect(result.sourceRunId)).status).toBe("succeeded")
        expect((yield* services.runtime.inspect(result.forkRunId)).status).toBe("succeeded")
        const sourceSession = Option.getOrThrow(yield* services.store.sessionReader(sessionId))
        const sourcePath = yield* sourceSession.path()
        expect(sourcePath.map((entry) => entry.id)).toEqual(result.source)
        expect(gapFree(sourcePath)).toBe(true)
      })

    return prepare(
      open(scenario).pipe(
        Effect.flatMap((result) => open((services) => verify(services, result))),
        Effect.orDie,
      ),
    )
  })
}
