import { Cause, Effect, Function, Stream } from "effect"

import type { ToolSchedulingPolicy } from "../service.js"

interface ScheduledCall {
  readonly call: { readonly name: string }
}

interface StageHandlers<A extends ScheduledCall, B, E, R, E2, R2> {
  readonly execute: (call: A) => Stream.Stream<B, E, R>
  readonly afterStage: (stage: ReadonlyArray<A>) => Effect.Effect<void, E2, R2>
}

/** @experimental Default safe policy: every framework-executed call is an exclusive barrier. */
export const defaultToolScheduling: ToolSchedulingPolicy = {
  maxConcurrency: 1,
  parallelSafe: [],
}

/** @experimental Validate a live Agent's tool scheduling policy before its first model call. */
export const validationFailure: {
  (declaredTools: ReadonlyArray<string>): (policy: ToolSchedulingPolicy) => string | undefined
  (policy: ToolSchedulingPolicy, declaredTools: ReadonlyArray<string>): string | undefined
} = Function.dual(2, (policy: ToolSchedulingPolicy, declaredTools: ReadonlyArray<string>): string | undefined => {
  if (!Number.isSafeInteger(policy.maxConcurrency) || policy.maxConcurrency <= 0) {
    return "Agent.toolScheduling.maxConcurrency must be a positive safe integer"
  }
  const seen = new Set<string>()
  const declared = new Set(declaredTools)
  for (const name of policy.parallelSafe) {
    if (seen.has(name)) return `Agent.toolScheduling.parallelSafe contains duplicate tool: ${name}`
    if (!declared.has(name)) return `Agent.toolScheduling.parallelSafe names an undeclared tool: ${name}`
    seen.add(name)
  }
  return undefined
})

const stages = <A extends ScheduledCall>(
  calls: ReadonlyArray<A>,
  policy: ToolSchedulingPolicy,
): ReadonlyArray<ReadonlyArray<A>> => {
  const parallelSafe = new Set(policy.parallelSafe)
  const result: Array<ReadonlyArray<A>> = []
  let parallel: Array<A> = []
  const flushParallel = (): void => {
    if (parallel.length === 0) return
    result.push(parallel)
    parallel = []
  }
  for (const call of calls) {
    if (parallelSafe.has(call.call.name)) {
      parallel.push(call)
    } else {
      flushParallel()
      result.push([call])
    }
  }
  flushParallel()
  return result
}

/**
 * @experimental Execute parallel-safe calls with a bound while treating every other authored call as an exclusive
 * barrier. Inner streams merge live; callers retain result order separately by the original call index.
 */
export const schedule: {
  <A extends ScheduledCall, B, E, R, E2, R2>(
    policy: ToolSchedulingPolicy,
    handlers: StageHandlers<A, B, E, R, E2, R2>,
  ): (calls: ReadonlyArray<A>) => Stream.Stream<B, E | E2, R | R2>
  <A extends ScheduledCall, B, E, R, E2, R2>(
    calls: ReadonlyArray<A>,
    policy: ToolSchedulingPolicy,
    handlers: StageHandlers<A, B, E, R, E2, R2>,
  ): Stream.Stream<B, E | E2, R | R2>
} = Function.dual(
  3,
  <A extends ScheduledCall, B, E, R, E2, R2>(
    calls: ReadonlyArray<A>,
    policy: ToolSchedulingPolicy,
    handlers: StageHandlers<A, B, E, R, E2, R2>,
  ): Stream.Stream<B, E | E2, R | R2> =>
    Stream.fromIterable(stages(calls, policy)).pipe(
      Stream.flatMap((stage) => {
        const failures = new Array<Cause.Cause<E> | undefined>(stage.length)
        const settled = Stream.fromIterable(stage.map((call, index) => ({ call, index }))).pipe(
          Stream.flatMap(
            ({ call, index }) =>
              handlers.execute(call).pipe(
                Stream.catchCause((cause) =>
                  Stream.sync(() => {
                    failures[index] = cause
                  }).pipe(Stream.drain),
                ),
              ),
            { concurrency: policy.maxConcurrency },
          ),
        )
        return settled.pipe(
          Stream.concat(
            Stream.suspend(() => {
              const failure = failures.find((cause) => cause !== undefined)
              if (failure !== undefined) return Stream.failCause<E | E2>(failure)
              return Stream.fromEffect(handlers.afterStage(stage)).pipe(Stream.drain)
            }),
          ),
        )
      }),
    ),
)
