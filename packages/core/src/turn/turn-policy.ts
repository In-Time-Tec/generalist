import { Effect, Layer, Schema } from "effect"
import { dual } from "effect/Function"
import { LanguageModel, Prompt, Response } from "effect/unstable/ai"
/** @experimental Snapshot given to a policy before each follow-up turn. */
export interface TurnInfo {
  readonly turn: number // 0-based count of completed model turns so far
  readonly history: Prompt.Prompt
  readonly pendingToolResults: ReadonlyArray<Response.ToolResultPart<string, unknown, unknown>>
}

/** @experimental Per-turn overrides applied when a policy continues. */
export interface TurnOverrides {
  readonly instructions?: string
  readonly model?: Layer.Layer<LanguageModel.LanguageModel>
  readonly activeTools?: ReadonlyArray<string>
}

/** @experimental */
export interface Continue {
  readonly _tag: "Continue"
  readonly overrides?: TurnOverrides
}

/** @experimental */
export interface Stop {
  readonly _tag: "Stop"
  readonly reason: StopReason
}

/** @experimental */
export type Decision = Continue | Stop

/** @experimental A configured follow-up turn cap was exhausted. */
export interface TurnLimit {
  readonly _tag: "TurnLimit"
  readonly limit: number
}

/** @experimental The policy determined that the run's goal is satisfied. */
export interface GoalSatisfied {
  readonly _tag: "GoalSatisfied"
}

/** @experimental A named policy budget was exhausted. */
export interface BudgetExhausted {
  readonly _tag: "BudgetExhausted"
  readonly budget: string
}

/** @experimental A custom policy stopped for a host-defined detail. */
export interface Policy {
  readonly _tag: "Policy"
  readonly detail: string
}

/** @experimental Schema-backed reason for a successful policy stop. */
export const StopReason = Schema.Union([
  Schema.Struct({ _tag: Schema.tag("TurnLimit"), limit: Schema.Finite }),
  Schema.Struct({ _tag: Schema.tag("GoalSatisfied") }),
  Schema.Struct({ _tag: Schema.tag("BudgetExhausted"), budget: Schema.String }),
  Schema.Struct({ _tag: Schema.tag("Policy"), detail: Schema.String }),
])

/** @experimental Schema-backed reason for a successful policy stop. */
export type StopReason = typeof StopReason.Type

/** @experimental A turn policy could not evaluate its decision. */
export class TurnPolicyError extends Schema.TaggedErrorClass<TurnPolicyError>()("@batonfx/core/TurnPolicyError", {
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
}) {}

/** @experimental A turn policy in the spirit of `Schedule`. */
export interface TurnPolicy<R = never> {
  readonly decide: (info: TurnInfo) => Effect.Effect<Decision, TurnPolicyError, R>
  readonly snapshot?: Snapshot
}

/** @experimental Portable constructor data for unbounded continuation. */
export interface ForeverSnapshot {
  readonly _tag: "Forever"
}

/** @experimental Portable constructor data for a recursive follow-up cap. */
export interface RecursSnapshot {
  readonly _tag: "Recurs"
  readonly count: number
}

/** @experimental Portable constructor data for a named-tool stop policy. */
export interface UntilToolCallSnapshot {
  readonly _tag: "UntilToolCall"
  readonly name: string
}

/** @experimental Portable constructor data for two composed portable policies. */
export interface BothSnapshot {
  readonly _tag: "Both"
  readonly first: Snapshot
  readonly second: Snapshot
}

/** @experimental Portable constructor data exposed by built-in turn policies. */
export type Snapshot = ForeverSnapshot | RecursSnapshot | UntilToolCallSnapshot | BothSnapshot

/** @experimental */
export const decision: {
  readonly continue: (overrides?: TurnOverrides) => Continue
  readonly stop: (reason: StopReason) => Stop
} = {
  continue: (overrides?: TurnOverrides): Continue => ({
    _tag: "Continue",
    ...(overrides === undefined ? {} : { overrides }),
  }),
  stop: (reason): Stop => ({ _tag: "Stop", reason }),
}

/** @experimental Construct a policy from a decide function. */
export const make = <R = never>(
  decide: (info: TurnInfo) => Effect.Effect<Decision, TurnPolicyError, R>,
): TurnPolicy<R> => ({ decide })

/** @experimental Continue after every turn; a run still completes naturally without pending tool results. */
export const forever: TurnPolicy = {
  decide: () => Effect.succeed(decision.continue()),
  snapshot: { _tag: "Forever" },
}

/** @experimental Continue for at most `n` follow-up turns after the first. */
export const recurs = (n: number): TurnPolicy => ({
  decide: (info) =>
    Effect.succeed(
      info.turn < n + 1
        ? decision.continue()
        : decision.stop(
            Number.isFinite(n)
              ? { _tag: "TurnLimit", limit: n }
              : { _tag: "Policy", detail: `Non-finite recurrence count stopped: ${String(n)}` },
          ),
    ),
  ...(Number.isFinite(n) ? { snapshot: { _tag: "Recurs" as const, count: n } } : {}),
})

/** @experimental Continue while a named tool has not yet been called this run. */
export const untilToolCall = (name: string): TurnPolicy => ({
  decide: (info) =>
    Effect.succeed(
      info.pendingToolResults.some((result) => result.name === name)
        ? decision.stop({ _tag: "GoalSatisfied" })
        : decision.continue(),
    ),
  snapshot: { _tag: "UntilToolCall", name },
})

const mergeOverrides = (first?: TurnOverrides, second?: TurnOverrides): TurnOverrides | undefined => {
  if (first === undefined) return second
  if (second === undefined) return first
  return { ...first, ...second }
}

/** @experimental Both must continue; overrides merge with `second` winning. */
export const both: {
  <R2>(second: TurnPolicy<R2>): <R1>(first: TurnPolicy<R1>) => TurnPolicy<R1 | R2>
  <R1, R2>(first: TurnPolicy<R1>, second: TurnPolicy<R2>): TurnPolicy<R1 | R2>
} = dual(
  2,
  <R1, R2>(first: TurnPolicy<R1>, second: TurnPolicy<R2>): TurnPolicy<R1 | R2> => ({
    decide: (info) =>
      Effect.gen(function* () {
        const left = yield* first.decide(info)
        if (left._tag === "Stop") return left
        const right = yield* second.decide(info)
        if (right._tag === "Stop") return right
        return decision.continue(mergeOverrides(left.overrides, right.overrides))
      }),
    ...(first.snapshot === undefined || second.snapshot === undefined
      ? {}
      : { snapshot: { _tag: "Both" as const, first: first.snapshot, second: second.snapshot } }),
  }),
)

/** @experimental Default policy: `forever` — no framework-imposed follow-up cap. */
export const defaultPolicy: TurnPolicy = forever
