import { Stream } from "effect"

/** Caller-owned successful stream result and replay codec. */
export interface StreamSuccessCodec<A, Success, ReplayError = never, ReplayServices = never> {
  readonly observe: (value: A) => void
  /** Whether the source reached its authored semantic terminal value rather than a downstream consumer stopping early. */
  readonly isComplete?: () => boolean
  readonly complete: () => Success
  readonly replay: (success: Success) => Stream.Stream<A, ReplayError, ReplayServices>
}

/** Collect and replay one stream as its emitted values. */
export const arrayStreamCodec = <A>(): StreamSuccessCodec<A, ReadonlyArray<A>> => {
  const values = new Array<A>()
  return {
    observe: (value) => void values.push(value),
    complete: () => values,
    replay: Stream.fromIterable,
  }
}
