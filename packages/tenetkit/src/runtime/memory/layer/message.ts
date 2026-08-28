import type { Prompt } from "effect/unstable/ai"
import { childRunIdFor } from "../../child/fan-out.js"
import { fanOutMemberSessionId } from "../../child/session.js"
import type { Address } from "../../address.js"
import type { Metadata } from "../../messaging/message.js"
import { digest as messageDigest } from "../../messaging/mailbox.js"
import type { InitialFanOutInput } from "../../service.js"
import { normalizeInitialFanOut } from "../start.js"
import { normalizePrompt } from "../prompt.js"

type MessageDraft = {
  id: string
  to: Address
  from?: Address
  sessionId: string
  prompt: Prompt.Prompt
  idempotencyKey: string
  causationId?: string
  correlationId: string
  inReplyTo?: string
  metadata?: Metadata
}

type MessageDraftSource = Omit<MessageDraft, "from" | "causationId" | "inReplyTo"> & {
  from: Address | undefined
  causationId: string | undefined
  inReplyTo: string | undefined
  metadata: Metadata
}

type NormalizedFanOutMember = ReturnType<typeof normalizeInitialFanOut>["members"][number] & {
  readonly ordinal: number
  readonly childRunId: string
  readonly sessionId: string
  readonly metadata: NonNullable<InitialFanOutInput["members"][number]["metadata"]>
}

type MessageDigestInput = Parameters<typeof messageDigest>[0]
type MutableMessageDigestInput = { -readonly [Key in keyof MessageDigestInput]: MessageDigestInput[Key] }
type MutableNormalizedFanOutMember = { -readonly [Key in keyof NormalizedFanOutMember]: NormalizedFanOutMember[Key] }

export const messageDigestInput = (input: {
  to: Address
  from: Address
  prompt: Prompt.Prompt
  correlationId: string
  metadata: Metadata
  causationId: string | undefined
  inReplyTo: string | undefined
}): MessageDigestInput => {
  const digestInput: MutableMessageDigestInput = {
    to: input.to,
    from: input.from,
    prompt: input.prompt,
    correlationId: input.correlationId,
    metadata: input.metadata,
  }
  if (input.causationId !== undefined) digestInput.causationId = input.causationId
  if (input.inReplyTo !== undefined) digestInput.inReplyTo = input.inReplyTo
  return digestInput
}

export const messageDraft = (input: MessageDraftSource): MessageDraft => {
  const draft: MessageDraft = {
    id: input.id,
    to: input.to,
    sessionId: input.sessionId,
    prompt: input.prompt,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
    metadata: input.metadata,
  }
  if (input.from !== undefined) draft.from = input.from
  if (input.causationId !== undefined) draft.causationId = input.causationId
  if (input.inReplyTo !== undefined) draft.inReplyTo = input.inReplyTo
  return draft
}

export const normalizedFanOutMember = (input: {
  readonly fanOutId: string
  readonly ordinal: number
  readonly member: InitialFanOutInput["members"][number]
}): NormalizedFanOutMember => {
  const { fanOutId, ordinal, member } = input
  const normalized: MutableNormalizedFanOutMember = {
    ordinal,
    key: member.key,
    childRunId: childRunIdFor(fanOutId, ordinal),
    selection: member.selection,
    prompt: normalizePrompt(member.prompt),
    sessionId: member.sessionId ?? fanOutMemberSessionId({ fanOutId, key: member.key }),
    metadata: member.metadata ?? {},
  }
  if (member.label !== undefined) normalized.label = member.label
  if (member.origin !== undefined) normalized.origin = member.origin
  return normalized
}
