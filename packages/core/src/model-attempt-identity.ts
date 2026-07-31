/** @experimental Identity of the provider attempt that produced the current stream part. */
export interface Identity {
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
}

/** @experimental Mutable cell tracking the active attempt identity within one run. */
export interface IdentityCell {
  current: Identity | undefined
}

/** @experimental */
export const makeIdentityCell = (): IdentityCell => ({ current: undefined })
