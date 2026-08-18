import { Option, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { runAddress } from "./agent-directory.js"
import { promptBytes, type MailboxEntry } from "./mailbox.js"
import type { Metadata } from "./message.js"
import type { RunEvent } from "./run-event.js"

/** @experimental Maximum UTF-8 result size carried inline by one settlement notification. */
export const maxResultBytes = 16_384

/** @experimental Durable payload written when a child Run reaches a terminal state. */
export const Payload = Schema.TaggedStruct("ChildSettlement", {
  notificationId: Schema.String,
  parentRunId: Schema.String,
  childRunId: Schema.String,
  terminalEventId: Schema.String,
  status: Schema.Literals(["succeeded", "failed", "cancelled"]),
  resultText: Schema.String,
  resultBytes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  resultTruncated: Schema.Boolean,
  /**
   * A member of a joined fan-out. The join hands the parent every member outcome as the result of
   * the call that started the group, so repeating that result here delivered the same bytes twice
   * on a channel with a smaller budget: it truncated, and then apologised for truncating. A member
   * notification therefore states the settlement and nothing else.
   */
  joined: Schema.optionalKey(Schema.Boolean),
})
/** @experimental */
export type Payload = typeof Payload.Type

/** @experimental One ordered durable child settlement notification. */
export const Notification = Schema.Struct({
  ...Payload.fields,
  sequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  admittedAtMillis: Schema.Finite,
})
/** @experimental */
export type Notification = typeof Notification.Type

const metadataKey = "tenetkit.childSettlement"
const encoder = new TextEncoder()

const stringify = (value: unknown): string => {
  if (typeof value === "string") return value
  try {
    const encoded = JSON.stringify(value)
    return encoded === undefined ? String(value) : encoded
  } catch {
    return String(value)
  }
}

/**
 * Bound one inline result.
 *
 * A truncated result used to instruct the reader to "ask the host child-settlement result-handoff
 * adapter" for the rest. No such adapter exists anywhere in TenetKit, so the instruction could only be
 * obeyed by inventing one. What is true is where the result already is: the terminal event of the
 * child, which the host reads by run id.
 */
const boundedResult = (childRunId: string, text: string) => {
  const resultBytes = encoder.encode(text).length
  if (resultBytes <= maxResultBytes) return { resultText: text, resultBytes, resultTruncated: false } as const
  return {
    resultText: `[Result truncated: ${resultBytes} UTF-8 bytes exceeds the ${maxResultBytes}-byte notification limit. The full result is the terminal event of child ${childRunId}.]`,
    resultBytes,
    resultTruncated: true,
  } as const
}

/** @experimental Stable identity shared by retries of one child's settlement. */
export const notificationIdFor = (childRunId: string): string => `child-settled:${childRunId}`

/** @experimental Build the typed notification payload from the authoritative terminal event. */
export const payloadFromEvent = (input: {
  readonly parentRunId: string
  readonly childRunId: string
  readonly event: RunEvent
  readonly joined?: boolean
}): Payload | undefined => {
  let status: Payload["status"]
  let text: string
  if (input.event._tag === "RunCompleted") {
    status = "succeeded"
    text = "text" in input.event.result ? input.event.result.text : stringify(input.event.result.value)
  } else if (input.event._tag === "RunFailed") {
    status = "failed"
    text = `${input.event.error._tag}: ${input.event.error.message}`
  } else if (input.event._tag === "RunCancelled") {
    status = "cancelled"
    text = input.event.reason ?? "Child run cancelled"
  } else return undefined
  return {
    _tag: "ChildSettlement",
    notificationId: notificationIdFor(input.childRunId),
    parentRunId: input.parentRunId,
    childRunId: input.childRunId,
    terminalEventId: input.event.eventId,
    status,
    ...boundedResult(input.childRunId, text),
    ...(input.joined === true ? { joined: true } : {}),
  }
}

/**
 * @experimental Encode one settlement payload as a durable observation.
 *
 * The persistence representation carries no model-facing content. `modelPrompt` separately
 * projects observations that are eligible for parent model delivery.
 */
export const observationEntry = (input: {
  readonly payload: Payload
  readonly parentSessionId: string
  readonly sequence: number
  readonly admittedAtMillis: number
}): MailboxEntry => {
  const metadata: Metadata = { [metadataKey]: input.payload }
  return {
    entryId: input.payload.notificationId,
    targetSessionId: input.parentSessionId,
    sequence: input.sequence,
    from: runAddress(input.payload.childRunId),
    fromRunId: input.payload.childRunId,
    to: runAddress(input.payload.parentRunId),
    messageId: input.payload.notificationId,
    idempotencyKey: input.payload.notificationId,
    digest: input.payload.notificationId,
    bytes: promptBytes(Prompt.empty),
    admittedAtMillis: input.admittedAtMillis,
    prompt: Prompt.empty,
    correlationId: input.payload.notificationId,
    metadata,
  }
}

/** @experimental Decode a typed settlement notification from mailbox metadata. */
export const fromMetadata = (input: {
  readonly metadata: Metadata
  readonly sequence: number
  readonly admittedAtMillis: number
}): Notification | undefined => {
  const payload = Option.getOrUndefined(Schema.decodeUnknownOption(Payload)(input.metadata[metadataKey]))
  if (payload === undefined) return undefined
  return { ...payload, sequence: input.sequence, admittedAtMillis: input.admittedAtMillis }
}

/** @experimental Decode a typed settlement notification from a mailbox row. */
export const fromMailboxEntry = (entry: MailboxEntry): Notification | undefined =>
  fromMetadata({ metadata: entry.metadata, sequence: entry.sequence, admittedAtMillis: entry.admittedAtMillis })

/**
 * @experimental Project a settlement payload into optional parent model content.
 *
 * Cancelled payloads are observation-only. Successful and failed payloads retain the existing
 * model-facing settlement message.
 */
export const modelPrompt = (payload: Payload): Prompt.Prompt | undefined => {
  if (payload.status === "cancelled") return undefined
  if (payload.joined === true)
    return Prompt.make(`Child run ${payload.childRunId} settled with status ${payload.status}.`)
  return Prompt.make(`Child run ${payload.childRunId} settled with status ${payload.status}.\n\n${payload.resultText}`)
}
