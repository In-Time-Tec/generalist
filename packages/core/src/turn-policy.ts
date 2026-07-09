import { Effect, Layer } from "effect"
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
}

/** @experimental */
export type Decision = Continue | Stop

/** @experimental A turn policy in the spirit of `Schedule`. */
export interface TurnPolicy {
  readonly decide: (info: TurnInfo) => Effect.Effect<Decision>
}

/** @experimental */
export const decision: { readonly continue: (overrides?: TurnOverrides) => Continue; readonly stop: Stop } = {
  continue: (overrides?: TurnOverrides): Continue => ({
    _tag: "Continue",
    ...(overrides === undefined ? {} : { overrides }),
  }),
  stop: { _tag: "Stop" },
}

/** @experimental Construct a policy from a decide function. */
export const make = (decide: (info: TurnInfo) => Effect.Effect<Decision>): TurnPolicy => ({ decide })

/** @experimental Continue for at most `n` follow-up turns after the first. */
export const recurs = (n: number): TurnPolicy =>
  make((info) => Effect.succeed(info.turn < n + 1 ? decision.continue() : decision.stop))

/** @experimental Continue while a named tool has not yet been called this run. */
export const untilToolCall = (name: string): TurnPolicy =>
  make((info) =>
    Effect.succeed(
      info.pendingToolResults.some((result) => result.name === name) ? decision.stop : decision.continue(),
    ),
  )

const mergeOverrides = (first?: TurnOverrides, second?: TurnOverrides): TurnOverrides | undefined => {
  if (first === undefined) return second
  if (second === undefined) return first
  return { ...first, ...second }
}

/** @experimental Both must continue; overrides merge with `second` winning. */
export const both = (first: TurnPolicy, second: TurnPolicy): TurnPolicy =>
  make((info) =>
    Effect.gen(function* () {
      const left = yield* first.decide(info)
      if (left._tag === "Stop") return decision.stop
      const right = yield* second.decide(info)
      if (right._tag === "Stop") return decision.stop
      return decision.continue(mergeOverrides(left.overrides, right.overrides))
    }),
  )

/** @experimental Default policy: `recurs(8)` — matches Relay's historical cap. */
export const defaultPolicy: TurnPolicy = recurs(8)
