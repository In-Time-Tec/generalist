import { Effect, Function, Schema } from "effect"
import type { Prompt } from "effect/unstable/ai"
import { type Scorer, score } from "../../eval/index.js"
import type { Trajectory } from "../../trajectory/index.js"
import { ActionableTaggedError, errorHint } from "../../core/error-hint.js"

/** @experimental Facts available to one scalar reward policy. */
export interface Input {
  readonly leaf: string
  readonly runId: string
  readonly messages: Prompt.Prompt
  readonly trajectory: Trajectory
}

/** @experimental A directly supplied reward service. */
export interface Service<R = never, E = never> {
  readonly source: string
  readonly evaluate: (input: Input) => Effect.Effect<number, E, R>
}

/** @experimental A reward policy returned a value that cannot be journaled. */
export class RewardInvalid extends ActionableTaggedError<RewardInvalid>()("generalist/rl-export/RewardInvalid", {
  leaf: Schema.String,
  source: Schema.String,
  // oxlint-disable-next-line effecttsgo/schema-number -- the error must retain the rejected NaN or infinite value.
  value: Schema.Number,
  hint: errorHint("Return one finite scalar reward for every exported trajectory leaf."),
}) {}

type Evaluate<R, E> = Effect.Effect<number, E, R> | ((input: Input) => Effect.Effect<number, E, R>)

/** @experimental Build a reward service from a custom Effect or evaluator. */
export const make: {
  <R = never, E = never>(evaluate: Evaluate<R, E>): (source: string) => Service<R, E>
  <R = never, E = never>(source: string, evaluate: Evaluate<R, E>): Service<R, E>
} = Function.dual(
  2,
  <R, E>(source: string, evaluate: Evaluate<R, E>): Service<R, E> => ({
    source,
    evaluate: Effect.isEffect(evaluate) ? () => evaluate : evaluate,
  }),
)

/** @experimental Score one when every completion gate's latest verdict passes, otherwise zero. */
export const fromGates: Service = make("gates", (input) => {
  const latest = new Map(input.trajectory.gates.map((gate) => [gate.name, gate] as const))
  return Effect.succeed([...latest.values()].some((gate) => gate.verdict === "fail") ? 0 : 1)
})

/** @experimental Average existing eval scorer values into one scalar reward. */
export const fromEval = <R, E>(scorers: ReadonlyArray<Scorer<R, E>>): Service<R, E> => {
  if (scorers.length === 0) throw new TypeError("Reward.fromEval requires at least one scorer")
  return make(`eval:${scorers.map((scorer) => scorer.name).join(",")}`, (input) =>
    score(input.trajectory, scorers).pipe(
      Effect.map((scores) => scores.reduce((total, result) => total + result.value, 0) / scores.length),
    ),
  )
}
