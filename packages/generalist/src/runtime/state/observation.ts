import { Context, Effect } from "effect"

/** Immutable external facts prepared by the authorized command boundary, never read by a reducer. */
export interface Observations {
  readonly commandId: string
  readonly occurredAtMillis: number
  readonly occurredAt: string
}

/** No default exists: a transition cannot execute without its persisted command observations. */
export class PreparedObservation extends Context.Service<PreparedObservation, Observations>()(
  "generalist/runtime/state/PreparedObservation",
) {}

export const occurredAt = PreparedObservation.pipe(Effect.map((observation) => observation.occurredAt))
export const occurredAtMillis = PreparedObservation.pipe(Effect.map((observation) => observation.occurredAtMillis))

export type Transition<A, E = never> = Effect.Effect<A, E, PreparedObservation>
