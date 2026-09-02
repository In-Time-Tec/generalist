import { Context, Effect, Layer, Schema } from "effect"
import { ToolContext } from "../../core/tools/tool-context.js"
import type { Prompt } from "effect/unstable/ai"
import type { Address } from "../address.js"
import { relationship, AddressInvalid, type DirectoryEntry, type Relationship } from "../execution/agent/directory.js"
import {
  AddressNotFound,
  CursorExpired,
  ForkSequenceInvalid,
  NoSnapshot,
  NotInFamily,
  RunBusy,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
  SteeringConflict,
} from "../errors.js"
import { MessageReceipt } from "./mailbox.js"
import type { Metadata } from "./message.js"
import type { Service as RunStoreService } from "../run/store.js"
import { InboxFull, type AdmissionPolicy } from "../../core/turn/steering.js"
import type { SteeringEntry } from "../run/steering.js"

/** One authorization question about one exact sender and target. */
export interface PolicyInput {
  readonly sender: DirectoryEntry
  readonly target: DirectoryEntry
  readonly relationship: Relationship | undefined
  readonly crossSession: boolean
}

/**
 * The host seam for addressing beyond Generalist's derived relationships.
 *
 * Generalist always allows self, parent, direct child, and sibling-under-one-parent from authoritative
 * durable identity. Everything else — notably addressing another Session — is a host decision, so
 * cross-product addressing is opt-in rather than a consequence of knowing an id.
 */
export class MessagingPolicy extends Context.Service<MessagingPolicy, MessagingPolicy.Service>()(
  "generalist/runtime/messaging/service/MessagingPolicy",
) {}
export namespace MessagingPolicy {
  export interface Service {
    readonly allow: (input: PolicyInput) => Effect.Effect<boolean>
    readonly discover: (sender: DirectoryEntry) => Effect.Effect<ReadonlyArray<Address>>
  }
}

const relationshipsOnly: MessagingPolicy.Service = {
  allow: () => Effect.succeed(false),
  discover: () => Effect.succeed([]),
}
const makePolicy = (policy: Partial<MessagingPolicy.Service> = {}): MessagingPolicy.Service => ({
  allow: policy.allow ?? relationshipsOnly.allow,
  discover: policy.discover ?? relationshipsOnly.discover,
})

/** Host messaging policy construction. */
export const Policy = { make: makePolicy }

/** Host policy over exact sender and target identity. */
export const layer = (policy: Partial<MessagingPolicy.Service>): Layer.Layer<MessagingPolicy> =>
  Layer.succeed(MessagingPolicy, MessagingPolicy.of(Policy.make(policy)))

/** Input for one addressed send. Sender identity is a Run id, never caller-supplied text. */
export interface SendMessageInput {
  readonly fromRunId: string
  readonly to: Address
  readonly idempotencyKey: string
  readonly prompt: Prompt.Prompt | Prompt.RawInput
  readonly messageId?: string
  readonly causationId?: string
  readonly correlationId?: string
  readonly inReplyTo?: string
  readonly metadata?: Metadata
  readonly policy?: AdmissionPolicy
}

/** Durable send failure. */
export const SendMessageError = Schema.Union([
  AddressNotFound,
  AddressInvalid,
  NotInFamily,
  RunBusy,
  SteeringConflict,
  ForkSequenceInvalid,
  NoSnapshot,
  CursorExpired,
  InboxFull,
  RunTerminal,
  RunNotFound,
  RuntimeUnavailable,
])
export type SendMessageError = typeof SendMessageError.Type
export type DirectoryError = RunNotFound | RuntimeUnavailable

/**
 * Decide one addressing attempt.
 *
 * Relationship is derived from durable parent links only. An Address a sender happens to know grants
 * nothing on its own.
 */
export const authorize = (input: {
  readonly sender: DirectoryEntry
  readonly target: DirectoryEntry
  readonly policy: MessagingPolicy.Service
}): Effect.Effect<void, NotInFamily> =>
  Effect.gen(function* () {
    const derived = relationship(input.sender, input.target)
    const crossSession = input.sender.sessionId !== input.target.sessionId
    if (derived !== undefined) return
    const allowed = yield* input.policy.allow({
      sender: input.sender,
      target: input.target,
      relationship: derived,
      crossSession,
    })
    if (allowed) return
    return yield* NotInFamily.make({
      fromRunId: input.sender.runId,
      targetRunId: input.target.runId,
    })
  })

/** Directory entries one Run may reach under Generalist relationships plus host policy. */
export const reachable = (input: {
  readonly store: RunStoreService
  readonly policy: MessagingPolicy.Service
  readonly runId: string
}): Effect.Effect<ReadonlyArray<DirectoryEntry>, DirectoryError> =>
  Effect.gen(function* () {
    const sender = yield* input.store.directory(input.runId)
    const related = yield* input.store.listRelated(input.runId)
    const announced = yield* input.policy.discover(sender)
    const resolved = yield* Effect.forEach(announced, (address) =>
      input.store.resolveAddress(address).pipe(Effect.result),
    ).pipe(Effect.map((results) => results.flatMap((result) => (result._tag === "Success" ? [result.success] : []))))
    const allowed = yield* Effect.filter(resolved, (target) =>
      authorize({ sender, target, policy: input.policy }).pipe(
        Effect.as(true),
        Effect.orElseSucceed(() => false),
      ),
    )
    const seen = new Set<string>([input.runId])
    const entries: Array<DirectoryEntry> = []
    for (const entry of [...related, ...allowed]) {
      if (seen.has(entry.runId)) continue
      seen.add(entry.runId)
      entries.push(entry)
    }
    return entries
  })

/**
 *
 * @effect-expect-leaking ToolContext
 * ToolContext is the per-call ambient identity of the running execution. Resolving it at Layer
 * creation would bind one Run into the service and let a caller send under another Run's identity,
 * which is exactly the forgery this contract exists to prevent.
 */
export class AgentMessaging extends Context.Service<
  AgentMessaging,
  {
    readonly send: (input: {
      readonly to: Address
      readonly idempotencyKey: string
      readonly prompt: Prompt.Prompt | Prompt.RawInput
      readonly policy?: AdmissionPolicy
      readonly inReplyTo?: string
      readonly metadata?: Metadata
    }) => Effect.Effect<MessageReceipt, SendMessageError, ToolContext>
    readonly inbox: (input: {
      readonly limit: number
    }) => Effect.Effect<ReadonlyArray<SteeringEntry>, DirectoryError, ToolContext>
    readonly identity: Effect.Effect<DirectoryEntry, DirectoryError, ToolContext>
    readonly directory: Effect.Effect<ReadonlyArray<DirectoryEntry>, DirectoryError, ToolContext>
  }
>()("generalist/runtime/messaging/service/AgentMessaging") {}

const currentRunId = Effect.flatMap(ToolContext, (context) =>
  context.runId === undefined
    ? RuntimeUnavailable.make({ message: "addressed messaging requires a Runtime-owned ToolContext" })
    : Effect.succeed(context.runId),
)

/**
 * Build in-execution messaging over one RunStore and host policy.
 *
 * Every send delegates to Runtime's unified Inbox admission, which journals the message before it
 * can become visible to the target Run.
 */
export const make = (input: {
  readonly store: RunStoreService
  readonly policy: MessagingPolicy.Service
  readonly sendMessage: (request: SendMessageInput) => Effect.Effect<MessageReceipt, SendMessageError>
}): AgentMessaging["Service"] => ({
  send: (request) =>
    Effect.gen(function* () {
      const runId = yield* currentRunId
      const message: SendMessageInput = {
        fromRunId: runId,
        to: request.to,
        idempotencyKey: request.idempotencyKey,
        prompt: request.prompt,
      }
      if (request.policy !== undefined) Object.assign(message, { policy: request.policy })
      if (request.inReplyTo !== undefined) Object.assign(message, { inReplyTo: request.inReplyTo })
      if (request.metadata !== undefined) Object.assign(message, { metadata: request.metadata })
      return yield* input.sendMessage(message)
    }),
  inbox: (request) =>
    Effect.gen(function* () {
      const runId = yield* currentRunId
      return yield* input.store.pendingSteering({ runId, limit: request.limit })
    }),
  identity: Effect.flatMap(currentRunId, input.store.directory),
  directory: Effect.gen(function* () {
    const runId = yield* currentRunId
    return yield* reachable({ store: input.store, policy: input.policy, runId })
  }),
})
