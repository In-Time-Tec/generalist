import { Effect, Layer, Stream } from "effect"
import {
  AddressNotFound,
  AgentNotRegistered,
  AgentVersionUnavailable,
  FanOutInvalid,
  FanOutRemainderUnsupported,
} from "../errors.js"
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
import { digest as steeringDigest } from "../steering.js"
import { childRunIdFor, digestFanOut, fanOutIdFor } from "../fan-out.js"
import { parseCursor } from "../tree-parse.js"

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
    const awaitFanOut = (fanOutId: string): ReturnType<RuntimeInterface["awaitFanOut"]> =>
      Effect.gen(function* () {
        const current = yield* store.inspectFanOut(fanOutId)
        if (current.status !== "running") return current
        const streams = yield* Effect.forEach(current.members, (member) =>
          store
            .inspect(member.childRunId)
            .pipe(Effect.map((run) => store.events({ runId: member.childRunId, cursor: run.lastSequence }))),
        )
        const changes = streams.slice(1).reduce((left, right) => Stream.merge(left, right), streams[0]!)
        const rechecked = yield* store.inspectFanOut(fanOutId)
        if (rechecked.status !== "running") return rechecked
        yield* Stream.runHead(changes)
        return yield* awaitFanOut(fanOutId)
      })

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
      snapshot: (runId) => store.snapshot(runId),
      history: (input) =>
        store.history({ runId: input.runId, cursor: input.cursor ?? cursorOrigin, limit: input.limit }),
      treeHistory: (input) =>
        Effect.gen(function* () {
          const position = yield* parseCursor(input.rootRunId, input.cursor)
          return yield* store.treeHistory({ rootRunId: input.rootRunId, position, limit: input.limit })
        }),
      inspectTree: (rootRunId) => store.inspectTree(rootRunId),
      list: (input) => store.list(input),
      respond: (input) => store.respond(input),
      signal: (input) => store.signal(input),
      cancel: (input) =>
        Effect.gen(function* () {
          yield* store.cancel(input)
          const cancelling = yield* store.list({ status: "cancelling", limit: Number.MAX_SAFE_INTEGER })
          yield* Effect.forEach(cancelling, (run) => active.interrupt(run.runId), {
            concurrency: "unbounded",
            discard: true,
          })
          yield* store.cancel(input)
        }),
      steer: (input) => {
        const prompt = normalizePrompt(input.prompt)
        return store.admitSteering({ ...input, prompt, digest: steeringDigest(prompt) })
      },
      inspect: (runId) => store.inspect(runId),
      fanOut: (input) =>
        Effect.gen(function* () {
          if (!Number.isSafeInteger(input.concurrency) || input.concurrency < 1) {
            return yield* FanOutInvalid.make({ message: "fan-out concurrency must be a positive integer" })
          }
          if (input.members.length === 0) {
            return yield* FanOutInvalid.make({ message: "fan-out requires at least one member" })
          }
          if (new Set(input.members.map((member) => member.key)).size !== input.members.length) {
            return yield* FanOutInvalid.make({ message: "fan-out member keys must be unique" })
          }
          if (
            input.join._tag === "Quorum" &&
            (!Number.isSafeInteger(input.join.required) ||
              input.join.required < 1 ||
              input.join.required > input.members.length)
          ) {
            return yield* FanOutInvalid.make({
              message: "fan-out quorum must be a positive safe integer no greater than member count",
            })
          }
          const info = yield* store.info
          if (input.remainder === "terminate") {
            return yield* FanOutRemainderUnsupported.make({ remainder: "terminate", durability: info.durability })
          }
          yield* store.inspect(input.parentRunId)
          const fanOutId = fanOutIdFor(input.parentRunId, input.idempotencyKey)
          const members = yield* Effect.forEach(input.members, (member, ordinal) =>
            Effect.gen(function* () {
              const agent = resolveAgent(options, member.agent)
              if (agent === undefined) return yield* AgentVersionUnavailable.make({ agent: member.agent })
              if (!agents.has(agentKey(agent))) return yield* AgentNotRegistered.make({ agent })
              return {
                ordinal,
                key: member.key,
                childRunId: childRunIdFor(fanOutId, ordinal),
                agent,
                prompt: normalizePrompt(member.prompt),
                sessionId: member.sessionId ?? `fanout:${fanOutId}`,
                metadata: member.metadata ?? {},
              }
            }),
          )
          const normalized = {
            parentRunId: input.parentRunId,
            idempotencyKey: input.idempotencyKey,
            members,
            concurrency: Math.min(input.concurrency, members.length),
            join: input.join,
            remainder: input.remainder,
          }
          return yield* store.admitFanOut({
            ...normalized,
            fanOutId,
            digest: digestFanOut(normalized),
          })
        }),
      inspectFanOut: (fanOutId) => store.inspectFanOut(fanOutId),
      awaitFanOut,
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
