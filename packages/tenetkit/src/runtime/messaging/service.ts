import { Context, Effect, Layer } from "effect"
import {
  type DriverError,
  type DriverInterpreter,
  type DriverStateInvalid,
  type DriverUnknownReplay,
  intercept,
  operationKey,
} from "../../core/durable/driver.js"
import type { Exhausted } from "../../core/durable/run-budget.js"
import { ToolContext } from "../../core/tools/tool-context.js"
import type { Prompt } from "effect/unstable/ai"
import type { Address } from "../address.js"
import {
  relationship,
  type AddressInvalid,
  type DirectoryEntry,
  type Relationship,
} from "../execution/agent/directory.js"
import {
  MessagingUnauthorized,
  RuntimeUnavailable,
  type AddressNotFound,
  type MailboxFull,
  type MailboxRateLimited,
  type MessageConflict,
  type RunNotFound,
  type RunTerminal,
} from "../errors.js"
import type { MailboxEntry, MessageReceipt } from "./mailbox.js"
import type { Metadata } from "./message.js"
import type { Service as RunStoreService } from "../run/store.js"

/** @experimental One authorization question about one exact sender and target. */
export interface PolicyInput {
  readonly sender: DirectoryEntry
  readonly target: DirectoryEntry
  readonly relationship: Relationship | undefined
  readonly crossSession: boolean
}

/**
 * @experimental The host seam for addressing beyond TenetKit's derived relationships.
 *
 * TenetKit always allows self, parent, direct child, and sibling-under-one-parent from authoritative
 * durable identity. Everything else — notably addressing another Session — is a host decision, so
 * cross-product addressing is opt-in rather than a consequence of knowing an id.
 */
export interface Service {
  readonly allow: (input: PolicyInput) => Effect.Effect<boolean>
  readonly discover: (sender: DirectoryEntry) => Effect.Effect<ReadonlyArray<Address>>
}

/** @experimental */
export class MessagingPolicy extends Context.Service<MessagingPolicy, Service>()(
  "tenetkit/runtime/messaging/service/MessagingPolicy",
) {}

const relationshipsOnly: Service = {
  allow: () => Effect.succeed(false),
  discover: () => Effect.succeed([]),
}

/** @experimental */
const makePolicy = (policy: Partial<Service> = {}): Service => ({
  allow: policy.allow ?? relationshipsOnly.allow,
  discover: policy.discover ?? relationshipsOnly.discover,
})

/** @experimental Host messaging policy construction. */
export const Policy = { make: makePolicy }

/** @experimental Host policy over exact sender and target identity. */
export const layer = (policy: Partial<Service>): Layer.Layer<MessagingPolicy> =>
  Layer.succeed(MessagingPolicy, MessagingPolicy.of(Policy.make(policy)))

/** @experimental Input for one addressed send. Sender identity is a Run id, never caller-supplied text. */
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
}

/** @experimental */
export type SendMessageError =
  | AddressNotFound
  | AddressInvalid
  | MessagingUnauthorized
  | MailboxFull
  | MailboxRateLimited
  | MessageConflict
  | RunTerminal
  | RunNotFound
  | RuntimeUnavailable

/** @experimental */
export type DirectoryError = RunNotFound | RuntimeUnavailable

/**
 * @experimental Decide one addressing attempt.
 *
 * Relationship is derived from durable parent links only. An Address a sender happens to know grants
 * nothing on its own.
 */
export const authorize = (input: {
  readonly sender: DirectoryEntry
  readonly target: DirectoryEntry
  readonly policy: Service
}): Effect.Effect<void, MessagingUnauthorized> =>
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
    return yield* MessagingUnauthorized.make({
      from: input.sender.address,
      to: input.target.address,
      reason: crossSession ? "cross-session" : "unrelated",
    })
  })

/** @experimental Directory entries one Run may reach under TenetKit relationships plus host policy. */
export const reachable = (input: {
  readonly store: RunStoreService
  readonly policy: Service
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
 * @experimental
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
      readonly inReplyTo?: string
      readonly metadata?: Metadata
    }) => Effect.Effect<
      MessageReceipt,
      SendMessageError | DriverError | DriverStateInvalid | DriverUnknownReplay | Exhausted,
      DriverInterpreter | ToolContext
    >
    readonly inbox: (input: {
      readonly limit: number
    }) => Effect.Effect<ReadonlyArray<MailboxEntry>, DirectoryError, ToolContext>
    readonly directory: Effect.Effect<ReadonlyArray<DirectoryEntry>, DirectoryError, ToolContext>
  }
>()("tenetkit/runtime/messaging/service/AgentMessaging") {}

const currentRunId = Effect.flatMap(ToolContext, (context) =>
  context.runId === undefined
    ? RuntimeUnavailable.make({ message: "addressed messaging requires a Runtime-owned ToolContext" })
    : Effect.succeed(context.runId),
)

/**
 * @experimental Build in-execution messaging over one RunStore and host policy.
 *
 * Every send is one durable `send` driver operation with a `never` replay policy: a crash between
 * the journal record and the mailbox insert settles as an unknown operation for explicit resolution
 * instead of silently duplicating or losing the message.
 */
export const make = (input: {
  readonly store: RunStoreService
  readonly policy: Service
  readonly sendMessage: (request: SendMessageInput) => Effect.Effect<MessageReceipt, SendMessageError>
}): AgentMessaging["Service"] => ({
  send: (request) =>
    Effect.gen(function* () {
      const runId = yield* currentRunId
      return yield* intercept(
        {
          kind: "send",
          key: operationKey([runId, "send", request.idempotencyKey]),
          input: { to: request.to, idempotencyKey: request.idempotencyKey },
          replayPolicy: "never",
        },
        (() => {
          const message: SendMessageInput = {
            fromRunId: runId,
            to: request.to,
            idempotencyKey: request.idempotencyKey,
            prompt: request.prompt,
          }
          if (request.inReplyTo !== undefined) Object.assign(message, { inReplyTo: request.inReplyTo })
          if (request.metadata !== undefined) Object.assign(message, { metadata: request.metadata })
          return input.sendMessage(message)
        })(),
      )
    }),
  inbox: (request) =>
    Effect.gen(function* () {
      const runId = yield* currentRunId
      const entry = yield* input.store.directory(runId)
      return yield* input.store.pendingMessages({ sessionId: entry.sessionId, runId, limit: request.limit })
    }),
  directory: Effect.gen(function* () {
    const runId = yield* currentRunId
    return yield* reachable({ store: input.store, policy: input.policy, runId })
  }),
})
