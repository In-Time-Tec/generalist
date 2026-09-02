import { Duration, Effect, Function, Schema, type Types } from "effect"
import { ActionableTaggedError, errorHint } from "../error-hint.js"

const Amount = Schema.Finite.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
)
const Count = Amount.check(Schema.isInt())

/** Normalized portable limits. Duration is milliseconds. */
export const BudgetLimits = Schema.Struct({
  tokens: Schema.optionalKey(Count),
  usd: Schema.optionalKey(Amount),
  duration: Schema.optionalKey(Amount),
  toolCalls: Schema.optionalKey(Count),
  children: Schema.optionalKey(Count),
})
export type BudgetLimits = typeof BudgetLimits.Type

export interface Input {
  readonly tokens?: number
  readonly usd?: number
  readonly duration?: Duration.Input
  readonly toolCalls?: number
  readonly children?: number
}

/** One allocation and its transient loop remainder. Durable Runtime spend is projected from journal facts. */
export const RunBudget = Schema.Struct({
  allocation: BudgetLimits,
  remaining: BudgetLimits,
})
export type RunBudget = typeof RunBudget.Type

export const Dimension = Schema.Literals(["tokens", "usd", "duration", "toolCalls", "children"])
export type Dimension = typeof Dimension.Type

export const Remaining = Schema.Struct({
  tokens: Schema.optionalKey(Count),
  usd: Schema.optionalKey(Schema.Union([Amount, Schema.Literal("unknown")])),
  duration: Schema.optionalKey(Amount),
  toolCalls: Schema.optionalKey(Count),
  children: Schema.optionalKey(Count),
})
export type Remaining = typeof Remaining.Type

export const Spend = Schema.Struct({
  tokens: Count,
  usd: Schema.Union([Amount, Schema.Literal("unknown")]),
  duration: Amount,
  toolCalls: Count,
  children: Count,
})
export type Spend = typeof Spend.Type

export class Exhausted extends ActionableTaggedError<Exhausted>()("generalist/core/RunBudgetExhausted", {
  budget: Dimension,
  requested: Amount,
  remaining: Schema.optionalKey(Amount),
  hint: errorHint("Reduce the requested work or start the Run with a larger budget for this dimension."),
}) {}

/** Durable non-terminal suspension reason. */
export const BudgetExhausted = Schema.TaggedStruct("BudgetExhausted", { budget: Dimension })
export type BudgetExhausted = typeof BudgetExhausted.Type

/** Invalid serialized child grant or extension. */
export class Invalid extends ActionableTaggedError<Invalid>()("generalist/core/RunBudgetInvalid", {
  message: Schema.String,
  hint: errorHint("Use finite non-negative budget values within the parent allocation."),
}) {}

const dimensions: ReadonlyArray<Dimension> = ["tokens", "usd", "duration", "toolCalls", "children"]

const normalize = (input: Input): BudgetLimits => {
  const limits: Record<string, number> = {}
  if (input.tokens !== undefined) limits.tokens = input.tokens
  if (input.usd !== undefined) limits.usd = input.usd
  if (input.duration !== undefined) limits.duration = Duration.toMillis(input.duration)
  if (input.toolCalls !== undefined) limits.toolCalls = input.toolCalls
  if (input.children !== undefined) limits.children = input.children
  return Schema.decodeSync(BudgetLimits, { onExcessProperty: "error" })(limits)
}

/** Construct one validated in-memory budget. */
export const make = (input: Input): RunBudget => {
  const allocation = normalize(input)
  return { allocation, remaining: { ...allocation } }
}

/** Explicitly unlimited allocation. */
export const unbounded: BudgetLimits = {}

export const zeroSpend: Spend = { tokens: 0, usd: 0, duration: 0, toolCalls: 0, children: 0 }

const withAmount = (limits: BudgetLimits, dimension: Dimension, value: number): BudgetLimits => ({
  ...limits,
  [dimension]: value,
})

const subtract = (
  remaining: number | undefined,
  requested: number,
  budget: Dimension,
): Effect.Effect<number | undefined, Exhausted> => {
  if (requested === 0 || remaining === undefined) return Effect.succeed(remaining)
  return requested > remaining
    ? Effect.fail(Exhausted.make({ budget, requested, remaining }))
    : Effect.succeed(remaining - requested)
}

/** Charge transient loop state. Runtime reconstructs this state from its journal before replay. */
export const charge: {
  (usage: BudgetLimits): (budget: RunBudget) => Effect.Effect<RunBudget, Exhausted>
  (budget: RunBudget, usage: BudgetLimits): Effect.Effect<RunBudget, Exhausted>
} = Function.dual(2, (budget: RunBudget, usage: BudgetLimits) =>
  Effect.gen(function* () {
    // Usage is already typed BudgetLimits; a value that fails its own schema is a defect, not exhaustion.
    const valid = yield* Schema.decodeEffect(BudgetLimits, { onExcessProperty: "error" })(usage).pipe(Effect.orDie)
    let remaining = budget.remaining
    for (const dimension of dimensions) {
      const requested = valid[dimension]
      if (requested === undefined) continue
      const next = yield* subtract(remaining[dimension], requested, dimension)
      if (next !== undefined) remaining = withAmount(remaining, dimension, next)
    }
    return { ...budget, remaining }
  }),
)

interface Settlement {
  readonly budget: RunBudget
  readonly exhausted?: Exhausted
}

export const settleModelTokens: {
  (requested: number): (budget: RunBudget) => Settlement
  (budget: RunBudget, requested: number): Settlement
} = Function.dual(2, (budget: RunBudget, requested: number): Settlement => {
  const available = budget.remaining.tokens
  if (requested === 0 || available === undefined) return { budget }
  if (requested <= available) {
    return { budget: { ...budget, remaining: withAmount(budget.remaining, "tokens", available - requested) } }
  }
  return {
    budget: { ...budget, remaining: withAmount(budget.remaining, "tokens", 0) },
    exhausted: Exhausted.make({ budget: "tokens", requested, remaining: available }),
  }
})

export const reserveChild: {
  (
    grant: BudgetLimits,
  ): (
    parent: RunBudget,
  ) => Effect.Effect<{ readonly parent: RunBudget; readonly child: RunBudget }, Exhausted | Invalid>
  (
    parent: RunBudget,
    grant: BudgetLimits,
  ): Effect.Effect<{ readonly parent: RunBudget; readonly child: RunBudget }, Exhausted | Invalid>
} = Function.dual(2, (parent: RunBudget, grant: BudgetLimits) =>
  Effect.gen(function* () {
    const valid = yield* Schema.decodeEffect(BudgetLimits, { onExcessProperty: "error" })(grant).pipe(
      Effect.mapError((error) =>
        Invalid.make({ message: error.message, hint: "Use finite non-negative budget values" }),
      ),
    )
    let remaining = parent.remaining
    const childCount = yield* subtract(remaining.children, 1, "children")
    if (childCount !== undefined) remaining = withAmount(remaining, "children", childCount)
    for (const dimension of dimensions) {
      if (dimension === "children") continue
      const requested = valid[dimension]
      if (requested === undefined) continue
      const next = yield* subtract(remaining[dimension], requested, dimension)
      if (next !== undefined) remaining = withAmount(remaining, dimension, next)
    }
    return { parent: { ...parent, remaining }, child: make(valid) }
  }),
)

const add = (left: BudgetLimits, right: BudgetLimits): BudgetLimits => {
  let result = left
  for (const dimension of dimensions) {
    const value = right[dimension]
    if (value !== undefined) result = withAmount(result, dimension, (result[dimension] ?? 0) + value)
  }
  return result
}

export const refundUnused: {
  (child: RunBudget): (parent: RunBudget) => RunBudget
  (parent: RunBudget, child: RunBudget): RunBudget
} = Function.dual(
  2,
  (parent: RunBudget, child: RunBudget): RunBudget => ({
    ...parent,
    remaining: add(parent.remaining, child.remaining),
  }),
)

export const narrowChild: {
  (
    child: RunBudget,
    narrower: BudgetLimits,
  ): (parent: RunBudget) => Effect.Effect<{ readonly parent: RunBudget; readonly child: RunBudget }, Invalid>
  (
    parent: RunBudget,
    child: RunBudget,
    narrower: BudgetLimits,
  ): Effect.Effect<{ readonly parent: RunBudget; readonly child: RunBudget }, Invalid>
} = Function.dual(3, (parent: RunBudget, child: RunBudget, narrower: BudgetLimits) =>
  Effect.gen(function* () {
    const next = make(narrower)
    for (const dimension of dimensions) {
      const requested = next.allocation[dimension]
      const current = child.allocation[dimension]
      if (requested !== undefined && current !== undefined && requested > current) {
        return yield* Invalid.make({
          message: `${dimension} cannot be widened from ${current} to ${requested}`,
          hint: "Narrow child budgets at or below their reserved allocation",
        })
      }
    }
    const refund: Record<string, number> = {}
    for (const dimension of dimensions) {
      const current = child.allocation[dimension]
      const requested = next.allocation[dimension]
      if (current !== undefined && requested !== undefined && current > requested)
        refund[dimension] = current - requested
    }
    return { parent: { ...parent, remaining: add(parent.remaining, refund) }, child: next }
  }),
)

/** Rebuild transient remaining capacity from an immutable allocation and journal-derived spend. */
const fromSpend = (allocation: BudgetLimits, spend: Spend): RunBudget => {
  let remaining: BudgetLimits = { ...allocation }
  for (const dimension of dimensions) {
    const limit = allocation[dimension]
    const used = spend[dimension]
    if (limit === undefined || used === "unknown") continue
    remaining = withAmount(remaining, dimension, Math.max(0, limit - used))
  }
  return { allocation, remaining }
}

export const inspect: {
  (spend: Spend): (budget: RunBudget) => Remaining
  (budget: RunBudget, spend: Spend): Remaining
} = Function.dual(2, (budget: RunBudget, spend: Spend): Remaining => {
  const projected = fromSpend(budget.allocation, spend).remaining
  const result: Types.Mutable<Remaining> = { ...projected }
  if (budget.allocation.usd !== undefined && spend.usd === "unknown") result.usd = "unknown"
  return result
})

/** Aggregate limits available after reserving the child admissions themselves. */
export const childGrant: {
  (admittedChildren: number): (remaining: Remaining) => BudgetLimits
  (remaining: Remaining, admittedChildren: number): BudgetLimits
} = Function.dual(2, (remaining: Remaining, admittedChildren: number): BudgetLimits => {
  const limits: Record<string, number> = {}
  if (remaining.tokens !== undefined) limits.tokens = remaining.tokens
  if (remaining.usd !== undefined && remaining.usd !== "unknown") limits.usd = remaining.usd
  if (remaining.duration !== undefined) limits.duration = remaining.duration
  if (remaining.toolCalls !== undefined) limits.toolCalls = remaining.toolCalls
  if (remaining.children !== undefined) limits.children = Math.max(0, remaining.children - admittedChildren)
  return Schema.decodeSync(BudgetLimits)(limits)
})

export const extend: {
  (delta: Input): (budget: RunBudget) => RunBudget
  (budget: RunBudget, delta: Input): RunBudget
} = Function.dual(2, (budget: RunBudget, delta: Input): RunBudget => {
  const addition = normalize(delta)
  return { allocation: add(budget.allocation, addition), remaining: add(budget.remaining, addition) }
})

export const resolve: {
  (runOverride?: BudgetLimits): (agentDefault?: BudgetLimits) => RunBudget
  (agentDefault?: BudgetLimits, runOverride?: BudgetLimits): RunBudget
} = Function.dual(2, (agentDefault: BudgetLimits | undefined, runOverride: BudgetLimits | undefined) =>
  make(runOverride ?? agentDefault ?? {}),
)
