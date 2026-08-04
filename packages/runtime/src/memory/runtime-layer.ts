import { Effect, Layer } from "effect"
import { AddressNotFound, AgentNotRegistered, AgentVersionUnavailable } from "../errors.js"
import { make as makeAddress } from "../address.js"
import { origin as cursorOrigin } from "../cursor.js"
import { make as makeMessage } from "../message.js"
import { RunStore } from "../run-store.js"
import {
  Runtime,
  type Interface as RuntimeInterface,
  type LayerOptions,
  type SendInput,
  type SpawnInput,
} from "../runtime.js"
import { normalizePrompt } from "./prompt.js"
import { agentKey } from "./state.js"
import { makeRunStore } from "./store.js"
import { AgentHost } from "../agent-host.js"
import { make as makeAgentHost } from "../agent-host.js"
import { ActiveExecutions, layer as activeExecutionsLayer } from "../active-executions.js"

const nextMessageId = (prefix: string, key: string): string => `${prefix}:${key}`

const resolveAgent = (options: LayerOptions, agentRef: SpawnInput["agent"]) =>
  options.agents.find(
    (entry) =>
      entry.ref.id === agentRef.id && entry.ref.version === agentRef.version && entry.ref.digest === agentRef.digest,
  )?.ref

export const makeRuntime = (
  options: LayerOptions,
): Effect.Effect<RuntimeInterface, never, RunStore | ActiveExecutions> =>
  Effect.gen(function* () {
    const store = yield* RunStore
    const active = yield* ActiveExecutions
    const agents = new Map(options.agents.map((entry) => [agentKey(entry.ref), entry.ref] as const))
    const addresses = new Map(options.addresses.map((entry) => [entry.address, entry.agent] as const))

    return Runtime.of({
      send: (input: SendInput) =>
        Effect.gen(function* () {
          const agent = addresses.get(input.to)
          if (agent === undefined) return yield* AddressNotFound.make({ address: input.to })
          if (!agents.has(agentKey(agent))) return yield* AgentNotRegistered.make({ agent })
          const prompt = normalizePrompt(input.prompt)
          const message = makeMessage({
            id: input.messageId ?? nextMessageId("msg", input.idempotencyKey),
            to: input.to,
            sessionId: input.sessionId,
            prompt,
            idempotencyKey: input.idempotencyKey,
            correlationId: input.correlationId ?? input.idempotencyKey,
            metadata: input.metadata ?? {},
            ...(input.from === undefined ? {} : { from: input.from }),
            ...(input.causationId === undefined ? {} : { causationId: input.causationId }),
            ...(input.inReplyTo === undefined ? {} : { inReplyTo: input.inReplyTo }),
          })
          return yield* store.admitSend({
            message,
            agent,
            ...(input.runId === undefined ? {} : { runId: input.runId }),
          })
        }),
      spawn: (input: SpawnInput) =>
        Effect.gen(function* () {
          const agent = resolveAgent(options, input.agent)
          if (agent === undefined) return yield* AgentVersionUnavailable.make({ agent: input.agent })
          if (!agents.has(agentKey(agent))) return yield* AgentNotRegistered.make({ agent })
          const parent = yield* store.inspect(input.parentRunId)
          const sessionId = input.sessionId ?? `child:${input.parentRunId}`
          const idempotencyKey = input.idempotencyKey ?? `spawn:${input.parentRunId}:${input.invocationId}`
          const address = makeAddress(`spawn:${input.parentRunId}`)
          const prompt = normalizePrompt(input.prompt)
          const message = makeMessage({
            id: input.messageId ?? nextMessageId("spawn", idempotencyKey),
            to: address,
            sessionId,
            prompt,
            idempotencyKey,
            correlationId: input.correlationId ?? parent.runId,
            metadata: input.metadata ?? {},
          })
          return yield* store.admitSpawn({
            ...input,
            message,
            agent,
            parentRunId: input.parentRunId,
          })
        }),
      events: (input) =>
        store.events({
          runId: input.runId,
          cursor: input.cursor ?? cursorOrigin,
        }),
      snapshot: (runId) => store.inspect(runId).pipe(Effect.map((run) => ({ run, cursor: run.lastSequence }))),
      history: (input) =>
        store.history({ runId: input.runId, cursor: input.cursor ?? cursorOrigin, limit: input.limit }),
      list: (input) => store.list(input),
      respond: (input) => store.respond(input),
      signal: (input) => store.signal(input),
      cancel: (input) => store.cancel(input).pipe(Effect.andThen(active.interrupt(input.runId))),
      inspect: (runId) => store.inspect(runId),
    })
  })

export const layer = (options: LayerOptions): Layer.Layer<Runtime | RunStore | AgentHost> => {
  const store = Layer.effect(RunStore, makeRunStore(options))
  const active = activeExecutionsLayer
  const runtime = Layer.effect(Runtime, makeRuntime(options)).pipe(Layer.provide(Layer.merge(store, active)))
  const host = Layer.effect(AgentHost, makeAgentHost({ workerId: "memory", agents: options.agents })).pipe(
    Layer.provide(Layer.merge(store, active)),
  )
  return Layer.mergeAll(runtime, host, store)
}

export const layerMemory = layer
