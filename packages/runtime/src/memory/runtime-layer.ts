import { Effect, Layer, Stream } from "effect"
import {
  AddressNotFound,
  ChildSelectionMissing,
  ExecutableIdentityMismatch,
  ExecutableRegistrationInvalid,
  FanOutInvalid,
  FanOutRemainderUnsupported,
  StartInvalid,
} from "../errors.js"
import { make as makeAddress, type Address } from "../address.js"
import { origin as cursorOrigin } from "../cursor.js"
import { make as makeMessage } from "../message.js"
import { RunStore } from "../run-store.js"
import {
  Runtime,
  type Interface as RuntimeInterface,
  type InitialChildInput,
  type InitialFanOutInput,
  type LayerOptions,
  type SendInput,
  type StartInput,
  type SpawnInput,
} from "../runtime.js"
import { normalizePrompt } from "./prompt.js"
import { makeRunStore } from "./store.js"
import { ExecutionHost } from "../execution-host.js"
import { make as makeExecutionHost } from "../execution-host.js"
import { ActiveExecutions, layer as activeExecutionsLayer } from "../active-executions.js"
import { digest as steeringDigest } from "../steering.js"
import { childRunIdFor, fanOutIdFor, MAX_FAN_OUT_MEMBERS } from "../fan-out.js"
import { parseCursor } from "../tree-parse.js"
import { decodePinned, equals, resolveChild, type PinnedExecutable } from "../executable-manifest.js"
import { makeInput as makeResolverInput } from "../executable-resolver.js"
import type { ExecutableRegistration } from "../executable-registration.js"

type Registrations = ReadonlyArray<ExecutableRegistration>
import { validate as validateRegistrations } from "../executable-registration.js"
import { LocalScheduler, layer as localSchedulerLayer } from "../local-scheduler.js"
import { childSessionId, fanOutMemberSessionId } from "../child-session.js"

const nextMessageId = (prefix: string, key: string): string => `${prefix}:${key}`

const startAddress = makeAddress("runtime:start")

const normalizeInitialChild = (child: InitialChildInput) => ({
  invocationId: child.invocationId,
  idempotencyKey: child.idempotencyKey,
  selection: child.selection,
  prompt: normalizePrompt(child.prompt),
  sessionId: child.sessionId,
  ...(child.messageId === undefined ? {} : { messageId: child.messageId }),
  ...(child.correlationId === undefined ? {} : { correlationId: child.correlationId }),
  ...(child.metadata === undefined ? {} : { metadata: child.metadata }),
})

const normalizeInitialFanOut = (fanOut: InitialFanOutInput) => ({
  ...fanOut,
  members: fanOut.members.map((member) => ({
    ...member,
    prompt: normalizePrompt(member.prompt),
    ...(member.metadata === undefined ? {} : { metadata: member.metadata }),
  })),
})

export const makeRuntime = (
  options: LayerOptions,
): Effect.Effect<RuntimeInterface, never, RunStore | ActiveExecutions> =>
  Effect.gen(function* () {
    const store = yield* RunStore
    const active = yield* ActiveExecutions
    const addresses = new Map<
      string,
      { readonly executable: PinnedExecutable; readonly registrations: Registrations }
    >()
    for (const entry of options.addresses) {
      addresses.set(entry.address, {
        executable: entry.executable,
        registrations: Object.freeze([...entry.registrations]),
      })
    }
    const decode = (executable: unknown) =>
      Effect.try({
        try: () => decodePinned(executable),
        catch: (error) => ExecutableRegistrationInvalid.make({ message: String(error) }),
      })
    const attest = (input: {
      readonly executable: PinnedExecutable
      readonly registrations: Registrations
      readonly runId: string
    }) =>
      Effect.gen(function* () {
        const registrations = yield* validateRegistrations(input.executable, input.registrations)
        const attestation = yield* Effect.scoped(
          options.resolver
            .resolve(makeResolverInput({ runId: input.runId, ...input.executable, registrations }))
            .pipe(Effect.map((resolution) => resolution.attestation)),
        )
        if (!equals(attestation, input.executable)) {
          return yield* ExecutableIdentityMismatch.make({
            runId: input.runId,
            expectedRef: input.executable.ref,
            actualRef: attestation.ref,
          })
        }
        return registrations
      })
    const admissionRegistrations = (input: {
      readonly address: Address
      readonly sessionId: string
      readonly idempotencyKey: string
      readonly executable: PinnedExecutable
      readonly registrations: Registrations
      readonly runId: string
    }) =>
      store
        .hasAdmission({
          address: input.address,
          sessionId: input.sessionId,
          idempotencyKey: input.idempotencyKey,
        })
        .pipe(Effect.flatMap((admitted) => (admitted ? Effect.succeed(input.registrations) : attest(input))))
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
    const normalizeFanOut = (parentRunId: string, input: InitialFanOutInput) =>
      Effect.gen(function* () {
        if (!Number.isSafeInteger(input.concurrency) || input.concurrency < 1) {
          return yield* FanOutInvalid.make({ message: "fan-out concurrency must be a positive integer" })
        }
        if (input.members.length === 0 || input.members.length > MAX_FAN_OUT_MEMBERS) {
          return yield* FanOutInvalid.make({ message: `fan-out requires between 1 and ${MAX_FAN_OUT_MEMBERS} members` })
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
        const fanOutId = fanOutIdFor(parentRunId, input.idempotencyKey)
        const members = input.members.map((member, ordinal) => ({
          ordinal,
          key: member.key,
          childRunId: childRunIdFor(fanOutId, ordinal),
          selection: member.selection,
          prompt: normalizePrompt(member.prompt),
          sessionId: member.sessionId ?? fanOutMemberSessionId({ fanOutId, key: member.key }),
          metadata: member.metadata ?? {},
        }))
        return {
          parentRunId,
          idempotencyKey: input.idempotencyKey,
          members,
          concurrency: Math.min(input.concurrency, members.length),
          join: input.join,
          remainder: input.remainder,
          fanOutId,
        }
      })

    return Runtime.of({
      start: (input: StartInput) =>
        Effect.gen(function* () {
          const executable = yield* decode(input.executable)
          const registrations = yield* admissionRegistrations({
            address: startAddress,
            sessionId: input.sessionId,
            idempotencyKey: input.idempotencyKey,
            executable,
            registrations: input.registrations,
            runId: input.runId ?? "pending",
          })
          const initialChildren = input.initialChildren ?? []
          const initialFanOuts = input.initialFanOuts ?? []
          if (initialChildren.length > 64) {
            return yield* StartInvalid.make({ message: "initialChildren cannot contain more than 64 requests" })
          }
          if (initialFanOuts.length > 64) {
            return yield* StartInvalid.make({ message: "initialFanOuts cannot contain more than 64 requests" })
          }
          const activeEntry = executable.manifest.entries.find((entry) => entry.pin === executable.ref.active)
          const invocationIds = new Set<string>()
          const idempotencySources = new Set<string>()
          for (const child of initialChildren) {
            if (invocationIds.has(child.invocationId)) {
              return yield* StartInvalid.make({
                message: `duplicate initial child invocationId: ${child.invocationId}`,
              })
            }
            const source = `${child.sessionId}\0${child.idempotencyKey}`
            if (idempotencySources.has(source)) {
              return yield* StartInvalid.make({ message: "duplicate initial child sessionId/idempotencyKey" })
            }
            invocationIds.add(child.invocationId)
            idempotencySources.add(source)
            if (
              activeEntry?._tag !== "Agent" ||
              resolveChild(executable.ref, executable.manifest, child.selection) === undefined
            ) {
              return yield* ChildSelectionMissing.make({
                parentRunId: input.runId ?? "pending",
                selection: child.selection,
              })
            }
          }
          const fanOutKeys = new Set<string>()
          for (const fanOut of initialFanOuts) {
            if (fanOutKeys.has(fanOut.idempotencyKey)) {
              return yield* StartInvalid.make({
                message: `duplicate initial fan-out idempotencyKey: ${fanOut.idempotencyKey}`,
              })
            }
            fanOutKeys.add(fanOut.idempotencyKey)
            yield* normalizeFanOut(input.runId ?? "pending", fanOut)
            for (const member of fanOut.members) {
              if (
                activeEntry?._tag !== "Agent" ||
                resolveChild(executable.ref, executable.manifest, member.selection) === undefined
              ) {
                return yield* ChildSelectionMissing.make({
                  parentRunId: input.runId ?? "pending",
                  selection: member.selection,
                })
              }
            }
          }
          const prompt = normalizePrompt(input.prompt)
          const message = makeMessage({
            id: input.messageId ?? nextMessageId("start", input.idempotencyKey),
            to: startAddress,
            sessionId: input.sessionId,
            prompt,
            idempotencyKey: input.idempotencyKey,
            correlationId: input.correlationId ?? input.idempotencyKey,
            metadata: input.metadata ?? {},
            ...(input.causationId === undefined ? {} : { causationId: input.causationId }),
          })
          return yield* store.admitStart({
            message,
            executableRef: executable.ref,
            executableManifest: executable.manifest,
            registrations,
            initialChildren: initialChildren.map(normalizeInitialChild),
            initialFanOuts: initialFanOuts.map(normalizeInitialFanOut),
            ...(input.runId === undefined ? {} : { runId: input.runId }),
          })
        }),
      send: (input: SendInput) =>
        Effect.gen(function* () {
          const binding = addresses.get(input.to)
          if (binding === undefined) return yield* AddressNotFound.make({ address: input.to })
          const executable = yield* decode(binding.executable)
          const registrations = yield* admissionRegistrations({
            address: input.to,
            sessionId: input.sessionId,
            idempotencyKey: input.idempotencyKey,
            executable,
            registrations: binding.registrations,
            runId: input.runId ?? "pending",
          })
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
            executableRef: executable.ref,
            executableManifest: executable.manifest,
            registrations,
            ...(input.runId === undefined ? {} : { runId: input.runId }),
          })
        }),
      spawn: (input: SpawnInput) =>
        Effect.gen(function* () {
          const sessionId =
            input.sessionId ?? childSessionId({ parentRunId: input.parentRunId, invocationId: input.invocationId })
          const idempotencyKey = input.idempotencyKey ?? `spawn:${input.parentRunId}:${input.invocationId}`
          const address = makeAddress(`spawn:${input.parentRunId}`)
          const prompt = normalizePrompt(input.prompt)
          const message = makeMessage({
            id: input.messageId ?? nextMessageId("spawn", idempotencyKey),
            to: address,
            sessionId,
            prompt,
            idempotencyKey,
            correlationId: input.correlationId ?? input.parentRunId,
            metadata: input.metadata ?? {},
          })
          return yield* store.admitSpawn({
            ...input,
            message,
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
      treeChanges: (rootRunId) => store.treeChanges(rootRunId),
      inspectTree: (rootRunId) => store.inspectTree(rootRunId),
      list: (input) => store.list(input),
      respond: (input) => store.respond(input),
      respondApproval: (input) => store.respondApproval(input),
      signal: (input) => store.signal(input),
      cancel: (input) =>
        Effect.gen(function* () {
          yield* store.cancel(input)
          yield* active.interrupt(input.runId)
        }),
      steer: (input) => {
        const prompt = normalizePrompt(input.prompt)
        return store.admitSteering({ ...input, prompt, digest: steeringDigest(prompt) })
      },
      resolveOperation: (input) => store.resolveOperation(input),
      inspect: (runId) => store.inspect(runId),
      acknowledge: (input) => store.acknowledge(input),
      acknowledged: (runId) => store.acknowledged(runId),
      fanOut: (input) =>
        Effect.gen(function* () {
          return yield* store.admitFanOut(yield* normalizeFanOut(input.parentRunId, input))
        }),
      inspectFanOut: (fanOutId) => store.inspectFanOut(fanOutId),
      awaitFanOut,
    })
  })

export const layer = (options: LayerOptions): Layer.Layer<Runtime | RunStore | ExecutionHost | LocalScheduler> => {
  const store = Layer.effect(RunStore, makeRunStore(options))
  const active = activeExecutionsLayer
  const runtime = Layer.effect(Runtime, makeRuntime(options)).pipe(Layer.provide(Layer.merge(store, active)))
  const host = Layer.effect(ExecutionHost, makeExecutionHost({ workerId: "memory", resolver: options.resolver })).pipe(
    Layer.provide(Layer.merge(store, active)),
  )
  const scheduler = localSchedulerLayer({ workerId: "memory", ...options.scheduler }).pipe(
    Layer.provide(Layer.mergeAll(store, active, host)),
  )
  return Layer.mergeAll(runtime, host, store, scheduler)
}

export const layerMemory = layer
