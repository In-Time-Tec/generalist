interface Usage {
  readonly contextTokens: number
  readonly contextWindow: number
  readonly reserveTokens: number
}

const MAX_UNCHANGED_RUNS = 1_024
const key = (usage: Usage, contextRevision: string): string =>
  `${usage.contextTokens}:${usage.contextWindow}:${usage.reserveTokens}:${contextRevision}`

/** Remembers unchanged threshold passes per run until their usage changes. */
export const make = () => {
  const unchanged = new Map<string, string>()
  return {
    clear: (id: string): void => {
      unchanged.delete(id)
    },
    isUnchanged: (id: string, usage: Usage, contextRevision: string): boolean =>
      unchanged.get(id) === key(usage, contextRevision),
    recordUnchanged: (id: string, usage: Usage, contextRevision: string): void => {
      unchanged.delete(id)
      unchanged.set(id, key(usage, contextRevision))
      if (unchanged.size <= MAX_UNCHANGED_RUNS) return
      const oldest = unchanged.keys().next().value
      if (oldest !== undefined) unchanged.delete(oldest)
    },
  }
}
