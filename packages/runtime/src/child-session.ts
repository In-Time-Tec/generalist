/**
 * @experimental Session identity for a Run spawned by another Run.
 *
 * Session owns model-facing history, so a child that shares its parent's session identity inherits
 * the whole conversation. A subagent exists to work in isolation, so each spawned Run gets its own
 * session derived from the invocation that created it.
 *
 * Derivation is deterministic rather than generated: a durable Runtime retries, and a replayed spawn
 * must reattach to the same child Session instead of stranding the first attempt's work in an orphan.
 */
export const childSessionId = (parentRunId: string, invocationId: string): string =>
  `child:${encodeURIComponent(parentRunId)}:${encodeURIComponent(invocationId)}`

/** @experimental Session identity for one member of a fan-out. */
export const fanOutMemberSessionId = (fanOutId: string, key: string): string =>
  `fanout:${encodeURIComponent(fanOutId)}:${encodeURIComponent(key)}`

/** @experimental Shape one fan-out member into its admitted child form. */
export const fanOutMember = <
  M extends {
    readonly key: string
    readonly selection: string
    readonly prompt: P
    readonly sessionId?: string
    readonly metadata?: Readonly<Record<string, unknown>>
  },
  P,
>(
  input: { readonly fanOutId: string; readonly childRunIdFor: (fanOutId: string, ordinal: number) => string },
  member: M,
  ordinal: number,
) => ({
  ordinal,
  key: member.key,
  childRunId: input.childRunIdFor(input.fanOutId, ordinal),
  selection: member.selection,
  prompt: member.prompt,
  sessionId: member.sessionId ?? fanOutMemberSessionId(input.fanOutId, member.key),
  metadata: member.metadata ?? {},
})
