interface Usage {
  readonly contextTokens: number
  readonly contextWindow: number
  readonly reserveTokens: number
}

const MAX_UNCHANGED_SESSIONS = 1_024
const key = (usage: Usage): string => `${usage.contextTokens}:${usage.contextWindow}:${usage.reserveTokens}`

/** @experimental Remembers unchanged threshold passes until their session usage changes. */
export const makeThresholdState = () => {
  const unchanged = new Map<string, string>()
  return {
    clear: (sessionId: string): void => {
      unchanged.delete(sessionId)
    },
    isUnchanged: (sessionId: string, usage: Usage): boolean => unchanged.get(sessionId) === key(usage),
    recordUnchanged: (sessionId: string, usage: Usage): void => {
      unchanged.delete(sessionId)
      unchanged.set(sessionId, key(usage))
      if (unchanged.size <= MAX_UNCHANGED_SESSIONS) return
      const oldest = unchanged.keys().next().value
      if (oldest !== undefined) unchanged.delete(oldest)
    },
  }
}
