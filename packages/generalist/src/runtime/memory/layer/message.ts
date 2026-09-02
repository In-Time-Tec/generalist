import type { Prompt } from "effect/unstable/ai"
import { childRunIdFor } from "../../child/fan-out-internal.js"
import { fanOutMemberSessionId } from "../../child/session.js"
import type { Address } from "../../address.js"
import type { Metadata } from "../../messaging/message.js"
import type { InitialFanOutInput } from "../../service.js"
import { normalizeInitialFanOut } from "../start.js"
import { normalizePrompt } from "../prompt.js"
import { inheritance } from "../../../core/agent/lifecycle/fan-out.js"

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

type NormalizedFanOutMember = Omit<ReturnType<typeof normalizeInitialFanOut>["members"][number], "inherit"> & {
  readonly ordinal: number
  readonly childRunId: string
  readonly sessionId: string
  readonly metadata: NonNullable<InitialFanOutInput["members"][number]["metadata"]>
  readonly inherit: import("../../../core/agent/lifecycle/fan-out.js").Inheritance
}

type MutableNormalizedFanOutMember = { -readonly [Key in keyof NormalizedFanOutMember]: NormalizedFanOutMember[Key] }

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
    inherit: inheritance(member.inherit),
  }
  if (member.label !== undefined) normalized.label = member.label
  if (member.origin !== undefined) normalized.origin = member.origin
  return normalized
}
