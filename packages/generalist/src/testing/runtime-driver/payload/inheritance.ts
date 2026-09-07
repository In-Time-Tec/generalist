import { expect, it } from "@effect/vitest"
import { Effect, Layer, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
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

export const registerRetainedAndInherited = <LayerError, ClaimsLayerError>(
  registration: Registration<LayerError, ClaimsLayerError>,
): void => {
  const { capability, open, options, prepare } = registration
  it.effect("preserves retained completed operations across rewind and reopen", () => {
    const operationKey = `conformance:${slug(options.name)}:retained-never-operation`
    const scenario = (services: Services) =>
      Effect.gen(function* () {
        const source = yield* services.runtime.send({
          to: options.address,
          sessionId: `session:${operationKey}`,
          idempotencyKey: operationKey,
          prompt: "retain completed unsafe operation",
        })
        const claim = yield* capability.claim(services, { runId: source.runId, commandId: "retained-operation" })
        const operation = yield* services.store.recordOperation({
          ...claim,
          operationKey,
          kind: "tool",
          inputDigest: "retained-input",
          input: { value: "unchanged" },
          replayPolicy: "never",
          attempt: 0,
        })
        yield* services.store.startOperation({
          ...claim,
          commandId: `${claim.runId}:start:${operation.operationId}:0`,
          operationId: operation.operationId,
        })
        yield* services.store.completeOperation({
          ...claim,
          operationId: operation.operationId,
          outcome: { _tag: "Succeeded", value: "external-effect-already-completed" },
        })
        yield* services.store.emitAgentEvent({
          ...claim,
          commandId: `${claim.runId}:event:TurnStarted:1`,
          event: { _tag: "TurnStarted", turn: 1 },
        })
        yield* services.store.releaseExecution(claim)
        const branchRunId = `${source.runId}:retained`
        yield* services.store.rewind({
          runId: source.runId,
          commandId: `rewind:${branchRunId}`,
          branchRunId,
          toSequence: 0,
        })
        const retained = yield* services.store.getOperationByKey({ runId: branchRunId, operationKey })
        expect(retained).toMatchObject({
          status: "succeeded",
          replayPolicy: "never",
          result: "external-effect-already-completed",
        })
        return { branchRunId }
      })
    const verify = (services: Services, branchRunId: string) =>
      services.store.getOperationByKey({ runId: branchRunId, operationKey }).pipe(
        Effect.tap((retained) =>
          Effect.sync(() =>
            expect(retained).toMatchObject({
              status: "succeeded",
              replayPolicy: "never",
              result: "external-effect-already-completed",
            }),
          ),
        ),
        Effect.asVoid,
      )
    return prepare(
      open(scenario).pipe(
        Effect.flatMap((result) => open((services) => verify(services, result.branchRunId))),
        Effect.orDie,
      ),
    )
  })

  it.effect("keeps inherited model responses self-contained through nested forks and source rewind", () => {
    const name = slug(options.name)
    const agent = makeAgent({ name: `driver-${name}-inherited-response` })
    let modelCalls = 0
    const environment = Layer.mergeAll(
      Layer.effect(
        LanguageModel.LanguageModel,
        LanguageModel.make({
          generateText: () => Effect.succeed([{ type: "text" as const, text: "unused" }]),
          streamText: () => {
            modelCalls += 1
            return Stream.fromIterable<Response.StreamPartEncoded>([
              Response.makePart("text-delta", { id: "inherited", delta: "inherited response" }),
              finish,
            ])
          },
        }),
      ),
      layerAllowAll,
      layerAutoApprove,
    )
    const register = (runtime: Services["runtime"]) =>
      Effect.scoped(
        Layer.build(environment).pipe(
          Effect.flatMap((context) => runtime.register(agent).pipe(Effect.provideContext(context))),
        ),
      )
    const resolveCopied = (services: Services, runId: string) =>
      Effect.gen(function* () {
        const event = (yield* services.runtime.history({ runId, limit: 100 })).find(
          (candidate) => candidate._tag === "ModelResponseCommitted",
        )
        if (event?._tag !== "ModelResponseCommitted") return yield* Effect.die(`missing model response for ${runId}`)
        const response = yield* services.runtime.resolveModelResponse(event)
        expect(response.content.some((part) => part.type === "text" && part.text === "inherited response")).toBe(true)
        const operation = yield* services.store.getOperationByKey({ runId, operationKey: event.operationKey })
        expect(operation).toMatchObject({ status: "succeeded", replayPolicy: "never" })
      })
    const continueCopied = (services: Services, runId: string) =>
      Effect.gen(function* () {
        if (services.executor === undefined)
          return yield* Effect.die(`${options.name} inherited response continuation requires RunExecutor`)
        yield* register(services.runtime)
        yield* services.store.activate({ runId, commandId: "inherited-response-continuation-activate" })
        yield* services.executor.execute(
          yield* capability.claim(services, { runId, commandId: "inherited-response-continuation" }),
        )
        expect((yield* services.store.snapshot(runId)).run.status).toBe("succeeded")
        expect(modelCalls).toBe(1)
      })
    const scenario = (services: Services) =>
      Effect.gen(function* () {
        if (services.executor === undefined)
          return yield* Effect.die(`${options.name} inherited response requires RunExecutor`)
        yield* register(services.runtime)
        const handle = yield* services.runtime.start(agent, "produce one response", {
          sessionId: `session:conformance:${name}:inherited-response`,
          idempotencyKey: `inherited-response:${name}`,
        })
        yield* services.executor.execute(
          yield* capability.claim(services, { runId: handle.runId, commandId: "inherited-response" }),
        )
        const event = (yield* services.runtime.history({ runId: handle.runId, limit: 100 })).find(
          (candidate) => candidate._tag === "ModelResponseCommitted",
        )
        if (event?._tag !== "ModelResponseCommitted") return yield* Effect.die("missing source model response")
        yield* services.runtime.resolveModelResponse(event)
        const forkRunId = `${handle.runId}:response-fork`
        const nestedRunId = `${handle.runId}:response-nested`
        yield* services.store.fork({
          runId: handle.runId,
          commandId: `fork:${forkRunId}`,
          newRunId: forkRunId,
          atSequence: event.sequence,
        })
        yield* services.store.fork({
          runId: forkRunId,
          commandId: `fork:${nestedRunId}`,
          newRunId: nestedRunId,
          atSequence: event.sequence,
        })
        yield* services.store.rewind({
          runId: handle.runId,
          commandId: `rewind:${handle.runId}:discarded-after-response`,
          branchRunId: `${handle.runId}:discarded-after-response`,
          toSequence: 0,
        })
        yield* resolveCopied(services, forkRunId)
        yield* resolveCopied(services, nestedRunId)
        return {
          runIds: [forkRunId, nestedRunId] as const,
        }
      })
    return prepare(
      open(scenario).pipe(
        Effect.flatMap((result) =>
          open((services) =>
            Effect.gen(function* () {
              yield* Effect.forEach(result.runIds, (runId) => resolveCopied(services, runId), { discard: true })
              yield* continueCopied(services, result.runIds[1])
            }),
          ),
        ),
        Effect.orDie,
      ),
    )
  })
}
