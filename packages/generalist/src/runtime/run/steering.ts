import { digest as pinDigest } from "../../core/durable/pin.js"
export { InboxFull, defaultCapacity, defaultMaxPendingBytes, promptBytes } from "../../core/turn/steering.js"
import { Effect, Schema, Semaphore, SynchronizedRef } from "effect"
import { Prompt } from "effect/unstable/ai"
import { AdmissionPolicy as AdmissionPolicySchema, type AdmissionPolicy } from "../../core/turn/steering.js"
import { generateId } from "../../core/model/telemetry/events.js"
import { origin as cursorOrigin } from "../cursor.js"
import type { Service as ActiveExecutionsService } from "../execution/active-executions.js"
import { authorize, type MessagingPolicy } from "../messaging/service.js"
import { Message } from "../messaging/message.js"
import type { AdmitSteeringInput, Service as RunStoreService, SteeringAdmission } from "./store.js"
import type { RunSendError, RunSendOptions } from "../service.js"

export { AdmissionPolicySchema as AdmissionPolicy }

/** Authoritative identity that admitted one inbox message. */
export const MessageSource = Schema.Union([
  Schema.Struct({ runId: Schema.String }),
  Schema.Struct({ user: Schema.String }),
  Schema.Struct({ system: Schema.Literal(true) }),
])
export type MessageSource = typeof MessageSource.Type

/** Stable identity returned for durable steering admission and every identical retry. */
export const SteeringReceipt = Schema.Struct({
  entryId: Schema.String,
  sequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})

/** Stable identity returned for durable steering admission and every identical retry. */
export type SteeringReceipt = typeof SteeringReceipt.Type

/** One pending durable inbox entry. */
export const SteeringEntry = Schema.Struct({
  entryId: Schema.String,
  runId: Schema.String,
  sequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  idempotencyKey: Schema.String,
  digest: Schema.String,
  prompt: Prompt.Prompt,
  policy: AdmissionPolicySchema,
  from: MessageSource,
  addressed: Schema.optionalKey(Message),
})
export type SteeringEntry = typeof SteeringEntry.Type

/** Durable reconstruction data for a steering-driven turn. */
export const ExecutionContinuation = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  prompt: Prompt.Prompt,
  nextTurn: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  steeringEntryIds: Schema.Array(Schema.String),
})

/** Durable reconstruction data for a steering-driven turn. */
export type ExecutionContinuation = typeof ExecutionContinuation.Type

export const encodeContinuation = (continuation: ExecutionContinuation): string =>
  JSON.stringify(Schema.encodeSync(ExecutionContinuation)(continuation))

export const decodeContinuation = (encoded: string): ExecutionContinuation =>
  Schema.decodeUnknownSync(ExecutionContinuation)(JSON.parse(encoded))

/** Stable digest used for inbox idempotency. */
export const digest = (input: {
  readonly prompt: Prompt.Prompt
  readonly policy: AdmissionPolicy
  readonly from: MessageSource
  readonly addressed?: Message
}): string =>
  pinDigest({
    prompt: Schema.encodeSync(Prompt.Prompt)(input.prompt),
    policy: input.policy,
    from: input.from,
    addressed: input.addressed === undefined ? null : Schema.encodeSync(Message)(input.addressed),
  })

interface Options {
  readonly store: RunStoreService
  readonly active: ActiveExecutionsService
  readonly policy: MessagingPolicy.Service
}

export interface SendOptions extends RunSendOptions {
  readonly addressed?: Message
}

const normalizePrompt = (prompt: Prompt.Prompt | string): Prompt.Prompt =>
  Prompt.isPrompt(prompt) ? prompt : Prompt.make(prompt)

/** Construct the Runtime-owned durable inbox admission primitive. */
export const make = (services: Options) =>
  Effect.gen(function* () {
    const locks = yield* SynchronizedRef.make<ReadonlyMap<string, Semaphore.Semaphore>>(new Map())
    const lockFor = (runId: string): Effect.Effect<Semaphore.Semaphore> =>
      SynchronizedRef.modifyEffect(locks, (current) => {
        const existing = current.get(runId)
        return existing === undefined
          ? Semaphore.make(1).pipe(Effect.map((lock) => [lock, new Map(current).set(runId, lock)] as const))
          : Effect.succeed([existing, current] as const)
      })
    const authorizeSource = (runId: string, from: MessageSource) =>
      "runId" in from
        ? Effect.all({ sender: services.store.directory(from.runId), target: services.store.directory(runId) }).pipe(
            Effect.flatMap(({ sender, target }) => authorize({ sender, target, policy: services.policy })),
          )
        : services.store.directory(runId).pipe(Effect.asVoid)

    const existingInbox = (runId: string, idempotencyKey: string) =>
      services.store
        .history({ runId, cursor: cursorOrigin, limit: Number.MAX_SAFE_INTEGER })
        .pipe(
          Effect.map((events) =>
            events.find((event) => event._tag === "Inbox" && event.idempotencyKey === idempotencyKey),
          ),
        )

    const admit = (
      runId: string,
      input: Prompt.Prompt | string,
      options: SendOptions,
    ): Effect.Effect<SteeringAdmission, RunSendError> =>
      Effect.gen(function* () {
        const prompt = normalizePrompt(input)
        const policy = options.policy ?? "steer"
        const from = options.from ?? { system: true }
        yield* authorizeSource(runId, from)
        const idempotencyKey = options.idempotencyKey ?? `inbox:${yield* generateId}`
        const prior = policy === "rollback" ? yield* existingInbox(runId, idempotencyKey) : undefined
        const admission: AdmitSteeringInput = {
          runId,
          idempotencyKey,
          digest: digest({
            prompt,
            policy,
            from,
            ...(options.addressed === undefined ? undefined : { addressed: options.addressed }),
          }),
          prompt,
          policy,
          from,
          ...(options.addressed === undefined ? undefined : { addressed: options.addressed }),
        }
        if (policy === "rollback") {
          if (prior === undefined) yield* services.active.interruptAndAwait(runId)
          return yield* services.store.admitRollback({ ...admission, branchRunId: `run_${yield* generateId}` })
        }
        const result = yield* services.store.admitSteering(admission)
        if (policy === "interrupt" && !result.duplicate) yield* services.active.interrupt(runId)
        return result
      })

    return (
      runId: string,
      input: Prompt.Prompt | string,
      options: SendOptions = {},
    ): Effect.Effect<SteeringAdmission, RunSendError> =>
      lockFor(runId).pipe(Effect.flatMap((lock) => lock.withPermit(admit(runId, input, options))))
  })
