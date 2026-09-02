import { expect, it } from "@effect/vitest"
import { Effect, Schema, Stream } from "effect"
import { LanguageModel, Prompt } from "effect/unstable/ai"
import { make as makeAgent } from "../../core/agent/service.js"
import { make as makeAddress } from "../../runtime/address.js"
import { DuplicateAgent, IdempotencyConflict, RunIdConflict, UnknownAgent } from "../../runtime/errors.js"
import { durableIdentity } from "../../runtime/executable/registered-agent.js"
import type { ExecutionResult } from "../../runtime/execution/state.js"
import { make as makeMessage } from "../../runtime/messaging/message.js"
import { defaultTreePolicy } from "../../runtime/tree/policy.js"
import type {
  IdempotentStartCapability,
  Options,
  Services,
  StartByAgentCapability,
  UnknownAgentOnRecoveryCapability,
} from "./contract.js"

type Provide<LayerError> = <A, E>(use: (services: Services) => Effect.Effect<A, E>) => Effect.Effect<A, E | LayerError>

const slug = (value: string): string => value.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()

const identity = (name: string, test: string) => {
  const prefix = `conformance:${slug(name)}:${test}`
  return {
    sessionId: `session:${prefix}`,
    idempotencyKey: prefix,
    runId: `run:${prefix}`,
  }
}

const completedResult = (sessionId: string, text: string): ExecutionResult => ({
  text,
  turns: 1,
  session: { sessionId, leafId: null },
})

/** Admission conformance: exact idempotent replay and caller-supplied Run identity. */
export const registerAdmission = <LayerError, ClaimsLayerError>(input: {
  readonly options: Options<LayerError, ClaimsLayerError>
  readonly provide: Provide<LayerError>
}) => {
  const { options, provide } = input
  it.effect("replays exact admission and rejects divergent idempotency", () =>
    provide(({ runtime }) =>
      Effect.gen(function* () {
        const id = identity(options.name, "admission-idempotency")
        const first = yield* runtime.send({
          to: options.address,
          sessionId: id.sessionId,
          idempotencyKey: id.idempotencyKey,
          prompt: "same payload",
        })
        const duplicate = yield* runtime.send({
          to: options.address,
          sessionId: id.sessionId,
          idempotencyKey: id.idempotencyKey,
          prompt: "same payload",
        })
        expect(duplicate).toEqual({ ...first, duplicate: true })
        const conflict = yield* runtime
          .send({
            to: options.address,
            sessionId: id.sessionId,
            idempotencyKey: id.idempotencyKey,
            prompt: "changed payload",
          })
          .pipe(Effect.flip)
        expect(conflict).toBeInstanceOf(IdempotencyConflict)
        if (Schema.is(IdempotencyConflict)(conflict)) expect(conflict.existingRunId).toBe(first.runId)
      }),
    ),
  )

  it.effect("preserves caller Run identity and rejects conflicting admission", () =>
    provide(({ runtime }) =>
      Effect.gen(function* () {
        const id = identity(options.name, "admission-run-id")
        const first = yield* runtime.send({
          runId: id.runId,
          to: options.address,
          sessionId: id.sessionId,
          idempotencyKey: id.idempotencyKey,
          prompt: "caller identity",
        })
        expect(first.runId).toBe(id.runId)
        const conflict = yield* runtime
          .send({
            runId: `${id.runId}:other`,
            to: options.address,
            sessionId: id.sessionId,
            idempotencyKey: id.idempotencyKey,
            prompt: "caller identity",
          })
          .pipe(Effect.flip)
        expect(conflict).toBeInstanceOf(RunIdConflict)
      }),
    ),
  )
}

const testModel = LanguageModel.make({
  generateText: () => Effect.succeed([{ type: "text" as const, text: "unused" }]),
  streamText: () => Stream.empty,
})

const registerStartByAgent = <LayerError, ClaimsLayerError>(
  options: Options<LayerError, ClaimsLayerError>,
  capability: StartByAgentCapability,
  provide: Provide<LayerError>,
) => {
  it.effect("registers and starts an Agent by value with typed input, output, events, and inspection", () =>
    provide((services) =>
      Effect.gen(function* () {
        const id = identity(options.name, "start-by-agent")
        const agent = makeAgent({
          name: `driver-${slug(options.name)}-start-by-agent`,
          input: Schema.Struct({ question: Schema.String }),
          output: Schema.Struct({ answer: Schema.String }),
        })
        const model = yield* testModel
        yield* services.runtime.register(agent).pipe(Effect.provideService(LanguageModel.LanguageModel, model))
        const handle = yield* services.runtime.start(
          agent,
          { question: "What is durable?" },
          { sessionId: id.sessionId, idempotencyKey: id.idempotencyKey },
        )
        const claim = yield* capability.claim(services, { runId: handle.runId, workerId: "start-by-agent" })
        yield* services.store.complete({
          ...claim,
          result: {
            text: "typed answer",
            output: { answer: "typed answer" },
            turns: 1,
            session: { sessionId: id.sessionId, leafId: null },
          },
        })

        expect(yield* handle.await).toEqual({ answer: "typed answer" })
        const events = yield* Stream.runCollect(handle.events)
        const completed = events.find((event) => event._tag === "RunCompleted")
        expect(completed?._tag === "RunCompleted" ? completed.result : undefined).toMatchObject({
          output: { answer: "typed answer" },
        })
        expect(yield* services.runtime.inspect(handle.runId)).toMatchObject({
          runId: handle.runId,
          status: "succeeded",
          turn: 0,
          usage: { inputTokens: 0, outputTokens: 0 },
          usageFacts: [],
        })
      }),
    ),
  )

  it.effect("rejects duplicate Agent names at registration time", () =>
    provide(({ runtime }) =>
      Effect.gen(function* () {
        const name = `driver-${slug(options.name)}-duplicate-agent`
        const first = makeAgent({ name })
        const duplicate = makeAgent({ name })
        const model = yield* testModel
        yield* runtime.register(first).pipe(Effect.provideService(LanguageModel.LanguageModel, model))
        const error = yield* runtime
          .register(duplicate)
          .pipe(Effect.provideService(LanguageModel.LanguageModel, model), Effect.flip)
        expect(error).toBeInstanceOf(DuplicateAgent)
        expect(error).toMatchObject({ name })
      }),
    ),
  )
}

const registerIdempotentStart = <LayerError, ClaimsLayerError>(
  options: Options<LayerError, ClaimsLayerError>,
  capability: IdempotentStartCapability,
  provide: Provide<LayerError>,
) => {
  it.effect("returns the same RunId and admits no second run for the same Agent start key", () =>
    provide((services) =>
      Effect.gen(function* () {
        const id = identity(options.name, "idempotent-start")
        const agent = makeAgent({ name: `driver-${slug(options.name)}-idempotent-start` })
        const model = yield* testModel
        yield* services.runtime.register(agent).pipe(Effect.provideService(LanguageModel.LanguageModel, model))
        const start = () =>
          services.runtime.start(agent, "same input", {
            sessionId: id.sessionId,
            idempotencyKey: id.idempotencyKey,
          })
        const first = yield* start()
        const duplicate = yield* start()

        expect(duplicate.runId).toBe(first.runId)
        const accepted = (yield* services.runtime.history({ runId: first.runId, limit: 100 })).filter(
          (event) => event._tag === "RunAccepted",
        )
        expect(accepted).toHaveLength(1)
        const claim = yield* capability.claim(services, { runId: first.runId, workerId: "idempotent-start" })
        yield* services.store.complete({ ...claim, result: completedResult(id.sessionId, "completed") })
      }),
    ),
  )
}

const registerUnknownAgentOnRecovery = <LayerError, ClaimsLayerError>(
  options: Options<LayerError, ClaimsLayerError>,
  capability: UnknownAgentOnRecoveryCapability,
  provide: Provide<LayerError>,
) => {
  it.effect("suspends recovery when the persisted Agent name is not registered", () =>
    provide((services) =>
      Effect.gen(function* () {
        if (services.executor === undefined) {
          return yield* Effect.die(`${options.name} unknown-Agent recovery requires RunExecutor`)
        }
        const id = identity(options.name, "unknown-agent-on-recovery")
        const name = `driver-${slug(options.name)}-unknown-agent`
        const durable = durableIdentity(makeAgent({ name }))
        const address = makeAddress("runtime:start")
        const receipt = yield* services.store.admitStart(
          {
            message: makeMessage({
              id: `message:${id.idempotencyKey}`,
              to: address,
              sessionId: id.sessionId,
              prompt: Prompt.make("recover without registration"),
              idempotencyKey: id.idempotencyKey,
              correlationId: id.idempotencyKey,
            }),
            executableRef: durable.executable.ref,
            executableManifest: durable.executable.manifest,
            registrations: durable.registrations,
            treePolicy: defaultTreePolicy,
            initialChildren: [],
            initialFanOuts: [],
          },
          { activate: true },
        )
        const claim = yield* capability.claim(services, { runId: receipt.runId, workerId: "unknown-agent" })
        yield* services.executor.execute(claim)

        const inspection = yield* services.runtime.inspect(receipt.runId)
        const recovered = yield* services.store.loadExecution(receipt.runId)
        expect(inspection.status).toBe("waiting")
        expect(recovered.suspension).toBeInstanceOf(UnknownAgent)
        expect(recovered.suspension).toMatchObject({ name, runId: receipt.runId })
      }),
    ),
  )
}

export const registerAgentStart = <LayerError, ClaimsLayerError>(input: {
  readonly options: Options<LayerError, ClaimsLayerError>
  readonly provide: Provide<LayerError>
}): void => {
  const { options, provide } = input
  if (options.capabilities["start-by-agent"] !== undefined) {
    registerStartByAgent(options, options.capabilities["start-by-agent"], provide)
  }
  if (options.capabilities["idempotent-start"] !== undefined) {
    registerIdempotentStart(options, options.capabilities["idempotent-start"], provide)
  }
  if (options.capabilities["unknown-agent-on-recovery"] !== undefined) {
    registerUnknownAgentOnRecovery(options, options.capabilities["unknown-agent-on-recovery"], provide)
  }
}
