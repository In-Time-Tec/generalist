import { digest } from "../../core/durable/pin.js"
import { Schema } from "effect"

/**
 * @experimental Session identity for a Run spawned by another Run.
 *
 * Session owns model-facing history, so a child that shares its parent's session identity inherits
 * the whole conversation. A subagent exists to work in isolation, so each spawned Run gets its own
 * session derived from the invocation that created it.
 *
 * Derivation is deterministic rather than generated: a durable Runtime retries, and a replayed spawn
 * must reattach to the same child Session instead of stranding the first attempt's work in an orphan.
 *
 * The invocation is digested rather than escaped because it already carries an escaped operation key
 * that carries the tool call: percent-encoding it again grows the same identity at every level of
 * delegation, and a Session identity is a bounded key that a host may also use to name a file.
 */
export const childSessionId = (input: { readonly parentRunId: string; readonly invocationId: string }): string =>
  `child:${encodeURIComponent(input.parentRunId)}:${digest(input.invocationId)}`

/** @experimental Session identity for one member of a fan-out. */
export const fanOutMemberSessionId = (input: { readonly fanOutId: string; readonly key: string }): string =>
  `fanout:${encodeURIComponent(input.fanOutId)}:${digest(input.key)}`

/** @experimental Shape one fan-out member into its admitted child form. */
export const fanOutMember = <
  M extends {
    readonly key: string
    readonly selection: string
    readonly label?: string
    readonly prompt: P
    readonly sessionId?: string
    readonly metadata?: Readonly<Record<string, typeof Schema.Unknown.Type>>
    readonly origin?: import("./fan-out-internal.js").FanOutMemberOrigin
  },
  P,
>(input: {
  readonly fanOutId: string
  readonly childRunIdFor: (fanOutId: string, ordinal: number) => string
  readonly member: M
  readonly ordinal: number
}) => {
  const member = {
    ordinal: input.ordinal,
    key: input.member.key,
    childRunId: input.childRunIdFor(input.fanOutId, input.ordinal),
    selection: input.member.selection,
    prompt: input.member.prompt,
    sessionId: input.member.sessionId ?? fanOutMemberSessionId({ fanOutId: input.fanOutId, key: input.member.key }),
    metadata: input.member.metadata ?? {},
  }
  if (input.member.label !== undefined) Object.assign(member, { label: input.member.label })
  if (input.member.origin !== undefined) Object.assign(member, { origin: input.member.origin })
  return member
}
