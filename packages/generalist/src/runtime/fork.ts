/** One completed tool result replaced before a counterfactual branch resumes. */
export interface Substitution {
  readonly operationId: string
  readonly result: unknown
}

/** Select one committed journal prefix for a new Run. */
export interface ForkOptions {
  readonly atSequence: number
  readonly substitute?: Substitution
}

/** Select one committed journal prefix for in-place continuation. */
export interface RewindOptions {
  readonly toSequence: number
}
