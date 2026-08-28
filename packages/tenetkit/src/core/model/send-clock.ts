/** @experimental Mutable last-send clock driving conversation cache escalation. */
export interface SendClock {
  readonly idleSince: (now: number) => number | undefined
}

/** @experimental One run's last-send tracker; gaps above the escalation threshold move the conversation boundary to one hour. */
export const make = (): SendClock => {
  let lastSendAtMillis: number | undefined
  return {
    idleSince: (now: number): number | undefined => {
      const idle = lastSendAtMillis === undefined ? undefined : now - lastSendAtMillis
      lastSendAtMillis = now
      return idle
    },
  }
}
