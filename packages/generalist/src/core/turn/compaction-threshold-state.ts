interface Usage {
  readonly contextTokens: number
  readonly contextWindow: number
  readonly reserveTokens: number
}

const MAX_UNCHANGED_SESSIONS = 1_024
const key = (usage: Usage, contextRevision: string): string =>
  `${usage.contextTokens}:${usage.contextWindow}:${usage.reserveTokens}:${contextRevision}`

/** @experimental Remembers unchanged threshold passes until their session usage changes. */
export const make = () => {
  const unchanged = new Map<string, string>()
  return {
    clear: (sessionId: string): void => {
      unchanged.delete(sessionId)
    },
    isUnchanged: (sessionId: string, usage: Usage, contextRevision: string): boolean =>
      unchanged.get(sessionId) === key(usage, contextRevision),
    recordUnchanged: (sessionId: string, usage: Usage, contextRevision: string): void => {
      unchanged.delete(sessionId)
      unchanged.set(sessionId, key(usage, contextRevision))
      if (unchanged.size <= MAX_UNCHANGED_SESSIONS) return
      const oldest = unchanged.keys().next().value
      if (oldest !== undefined) unchanged.delete(oldest)
    },
  }
}
