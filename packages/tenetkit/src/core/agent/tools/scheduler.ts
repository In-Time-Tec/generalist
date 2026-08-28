import { Function, Stream } from "effect"

import type { ToolSchedulingPolicy } from "../service.js"

interface ScheduledCall {
  readonly call: { readonly name: string }
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
  <A extends ScheduledCall, B, E, R>(
    policy: ToolSchedulingPolicy,
    execute: (call: A) => Stream.Stream<B, E, R>,
  ): (calls: ReadonlyArray<A>) => Stream.Stream<B, E, R>
  <A extends ScheduledCall, B, E, R>(
    calls: ReadonlyArray<A>,
    policy: ToolSchedulingPolicy,
    execute: (call: A) => Stream.Stream<B, E, R>,
  ): Stream.Stream<B, E, R>
} = Function.dual(
  3,
  <A extends ScheduledCall, B, E, R>(
    calls: ReadonlyArray<A>,
    policy: ToolSchedulingPolicy,
    execute: (call: A) => Stream.Stream<B, E, R>,
  ): Stream.Stream<B, E, R> =>
    Stream.fromIterable(stages(calls, policy)).pipe(
      Stream.flatMap((stage) =>
        Stream.fromIterable(stage).pipe(Stream.flatMap(execute, { concurrency: policy.maxConcurrency })),
      ),
    ),
)
