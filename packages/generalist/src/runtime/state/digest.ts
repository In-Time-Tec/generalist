import { digest } from "../../core/durable/pin.js"
import { Function, Predicate } from "effect"
import type { Message } from "../messaging/message.js"
import type { ExecutableRef } from "../executable/manifest.js"
import type { AdmitStartInput } from "../run/store.js"
import { defaultTreePolicy, type TreePolicy } from "../tree/policy.js"
import type { FanOutMemberOrigin } from "../child/fan-out-internal.js"
import { promptDigestValue } from "../run/prompt-digest.js"

interface ChildDigestDetails {
  readonly parentRunId?: string
  readonly invocationId?: string
  readonly label?: string
  readonly origin?: FanOutMemberOrigin
}

export const messageDigest = (message: Message): string =>
  digest({
    to: message.to,
    from: message.from ?? null,
    sessionId: message.sessionId,
    prompt: promptDigestValue(message.prompt),
    causationId: message.causationId ?? null,
    correlationId: message.correlationId,
    inReplyTo: message.inReplyTo ?? null,
    metadata: message.metadata,
  })

export const rootDigest: {
  (treePolicy: TreePolicy): (message: Message) => string
  (message: Message, treePolicy: TreePolicy): string
} = Function.dual(2, (message: Message, treePolicy: TreePolicy): string => digest([messageDigest(message), treePolicy]))

export const childDigest: {
  (executableRef: ExecutableRef, details?: ChildDigestDetails): (message: Message) => string
  (message: Message, executableRef: ExecutableRef, details?: ChildDigestDetails): string
} = Function.dual(
  (args) => args.length >= 2 && Predicate.hasProperty(args[0], "id"),
  (message: Message, executableRef: ExecutableRef, details?: ChildDigestDetails): string =>
    digest([messageDigest(message), executableRef, details ?? null]),
)

export const startDigest = (input: AdmitStartInput): string =>
  digest([
    messageDigest(input.message),
    input.treePolicy ?? defaultTreePolicy,
    input.budget ?? null,
    input.initialChildren.map((child) => ({
      invocationId: child.invocationId,
      idempotencyKey: child.idempotencyKey,
      selection: child.selection,
      prompt: promptDigestValue(child.prompt),
      sessionId: child.sessionId,
      messageId: child.messageId ?? null,
      correlationId: child.correlationId ?? null,
      metadata: child.metadata ?? {},
    })),
    input.initialFanOuts.map((fanOut) => ({
      idempotencyKey: fanOut.idempotencyKey,
      concurrency: fanOut.concurrency,
      join: fanOut.join,
      remainder: fanOut.remainder,
      members: fanOut.members.map((member) => ({
        key: member.key,
        selection: member.selection,
        label: member.label ?? null,
        prompt: promptDigestValue(member.prompt),
        sessionId: member.sessionId ?? null,
        metadata: member.metadata ?? {},
        origin: member.origin ?? null,
      })),
    })),
  ])
