import { Effect, Function, Schema } from "effect"
import type { ParseOptions } from "effect/SchemaAST"

/** @experimental Finite resource limits for one run or child grant. */
const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

export const BudgetLimits = Schema.Struct({
  modelCalls: Schema.optionalKey(Count),
  toolCalls: Schema.optionalKey(Count),
  totalTokens: Schema.optionalKey(Count),
  childRuns: Schema.optionalKey(Count),
  handoffs: Schema.optionalKey(Count),
  depth: Schema.optionalKey(Count),
  deadline: Schema.optionalKey(Schema.String),
})

/** @experimental */
export type BudgetLimits = typeof BudgetLimits.Type

/** @experimental Portable run budget with allocation, remaining capacity, and tree depth. */
export const RunBudget = Schema.Struct({
  allocation: BudgetLimits,
  remaining: BudgetLimits,
  depth: Count,
})

/** @experimental */
export type RunBudget = typeof RunBudget.Type

/** @experimental */
export class RunBudgetExhausted extends Schema.TaggedErrorClass<RunBudgetExhausted>()(
  "@batonfx/core/RunBudgetExhausted",
  {
    dimension: Schema.Literals([
      "modelCalls",
      "toolCalls",
      "totalTokens",
      "childRuns",
      "handoffs",
      "depth",
      "deadline",
    ]),
    requested: Schema.Finite,
    remaining: Schema.optionalKey(Schema.Finite),
    message: Schema.optionalKey(Schema.String),
  },
) {}

/** @experimental */
export class RunBudgetGrantWidened extends Schema.TaggedErrorClass<RunBudgetGrantWidened>()(
  "@batonfx/core/RunBudgetGrantWidened",
  {
    dimension: Schema.Literals(["modelCalls", "toolCalls", "totalTokens", "childRuns", "handoffs", "depth"]),
    grant: Schema.Finite,
    remaining: Schema.Finite,
    message: Schema.optionalKey(Schema.String),
  },
) {}

type ChargeDimension = "modelCalls" | "toolCalls" | "totalTokens"

const chargeDimensions: ReadonlyArray<ChargeDimension> = ["modelCalls", "toolCalls", "totalTokens"]

const limitValue = (
  limits: BudgetLimits,
  dimension: ChargeDimension | "childRuns" | "handoffs" | "depth",
): number | undefined => limits[dimension]

const subtractFinite = (
  remaining: number | undefined,
  amount: number,
  dimension: RunBudgetExhausted["dimension"],
): Effect.Effect<number | undefined, RunBudgetExhausted> => {
  if (amount === 0 || remaining === undefined) return Effect.succeed(remaining)
  if (amount > remaining) {
    return Effect.fail(
      RunBudgetExhausted.make({
        dimension,
        requested: amount,
        remaining,
      }),
    )
  }
  const next = remaining - amount
  return Effect.succeed(next === 0 ? 0 : next)
}

type LimitDimension = ChargeDimension | "childRuns" | "handoffs" | "depth"

const limitDimensions: ReadonlyArray<LimitDimension> = [
  "modelCalls",
  "toolCalls",
  "totalTokens",
  "childRuns",
  "handoffs",
  "depth",
]

const mergeRemaining = (left: BudgetLimits, right: BudgetLimits): BudgetLimits => {
  const next: Record<string, number | string | undefined> = { ...left }
  for (const dimension of chargeDimensions) {
    const addition = right[dimension]
    if (addition === undefined) continue
    const current = next[dimension] as number | undefined
    next[dimension] = current === undefined ? addition : current + addition
  }
  if (right.childRuns !== undefined) {
    const current = next.childRuns as number | undefined
    next.childRuns = current === undefined ? right.childRuns : current + right.childRuns
  }
  if (right.handoffs !== undefined) {
    const current = next.handoffs as number | undefined
    next.handoffs = current === undefined ? right.handoffs : current + right.handoffs
  }
  return next as BudgetLimits
}

const subtractLimits = (
  remaining: BudgetLimits,
  grant: BudgetLimits,
): Effect.Effect<BudgetLimits, RunBudgetExhausted | RunBudgetGrantWidened> =>
  Effect.gen(function* () {
    const next: Record<string, number | string | undefined> = { ...remaining }
    for (const dimension of chargeDimensions) {
      const grantValue = grant[dimension]
      if (grantValue === undefined) continue
      const parentValue = limitValue(remaining, dimension)
      if (parentValue !== undefined && grantValue > parentValue) {
        return yield* RunBudgetGrantWidened.make({
          dimension,
          grant: grantValue,
          remaining: parentValue,
        })
      }
      next[dimension] = yield* subtractFinite(parentValue, grantValue, dimension)
    }
    if (grant.depth !== undefined) {
      const parentDepth = remaining.depth
      if (parentDepth !== undefined && grant.depth > parentDepth) {
        return yield* RunBudgetGrantWidened.make({
          dimension: "depth",
          grant: grant.depth,
          remaining: parentDepth,
        })
      }
      next.depth = grant.depth
    }
    if (grant.childRuns !== undefined) {
      const parentChildRuns = remaining.childRuns
      if (parentChildRuns !== undefined && grant.childRuns > parentChildRuns) {
        return yield* RunBudgetGrantWidened.make({
          dimension: "childRuns",
          grant: grant.childRuns,
          remaining: parentChildRuns,
        })
      }
      const childRunsNext = yield* subtractFinite(parentChildRuns, grant.childRuns, "childRuns")
      if (childRunsNext !== undefined) next.childRuns = childRunsNext
    }
    if (grant.deadline !== undefined) next.deadline = grant.deadline
    return next as BudgetLimits
  })

/** @experimental */
export const make: {
  (depth?: number): (allocation: BudgetLimits) => RunBudget
  (allocation: BudgetLimits, depth?: number): RunBudget
} = Function.dual(
  (args) => args.length > 1 || typeof args[0] === "object",
  (allocation: BudgetLimits, depth = 0): RunBudget => {
    const validAllocation = Schema.decodeUnknownSync(BudgetLimits, { onExcessProperty: "error" })(allocation)
    const validDepth = Schema.decodeUnknownSync(Count)(depth)
    return { allocation: validAllocation, remaining: { ...validAllocation }, depth: validDepth }
  },
)

/**
 * @experimental The allocation that charges nothing. Every dimension is undefined, so `charge`
 * short-circuits on an undefined remaining and no usage can exhaust it. Naming it keeps an
 * unbounded run from reading like a forgotten argument.
 */
export const unbounded: BudgetLimits = {}

/** @experimental */
export const allocate = make

/** @experimental */
export const charge: {
  (usage: BudgetLimits): (budget: RunBudget) => Effect.Effect<RunBudget, RunBudgetExhausted>
  (budget: RunBudget, usage: BudgetLimits): Effect.Effect<RunBudget, RunBudgetExhausted>
} = Function.dual(
  2,
  (budget: RunBudget, usage: BudgetLimits): Effect.Effect<RunBudget, RunBudgetExhausted> =>
    Effect.gen(function* () {
      const validUsage = yield* Schema.decodeUnknownEffect(BudgetLimits, { onExcessProperty: "error" })(usage).pipe(
        Effect.mapError((error) =>
          RunBudgetExhausted.make({ dimension: "modelCalls", requested: 0, message: error.message }),
        ),
      )
      const remaining: Record<string, number | string | undefined> = { ...budget.remaining }
      /**
       * An unbounded dimension has no key at all. `subtractFinite` returns undefined for it, and
       * assigning that back would create a key present with an undefined value — which
       * `optionalKey` rejects on the next checkpoint decode, failing the run instead of leaving it
       * uncharged. Only write a dimension that actually carries a remaining amount.
       */
      const chargeDimension = function* (dimension: ChargeDimension | "handoffs", amount: number) {
        if (amount === 0) return
        const next = yield* subtractFinite(limitValue(remaining as BudgetLimits, dimension), amount, dimension)
        if (next === undefined) return
        remaining[dimension] = next
      }
      for (const dimension of chargeDimensions) {
        const amount = validUsage[dimension]
        if (amount === undefined) continue
        yield* chargeDimension(dimension, amount)
      }
      if (validUsage.handoffs !== undefined) yield* chargeDimension("handoffs", validUsage.handoffs)
      return { ...budget, remaining: remaining as BudgetLimits }
    }),
)

/** @experimental */
export const reserveChild: {
  (
    grant: BudgetLimits,
  ): (
    parent: RunBudget,
  ) => Effect.Effect<
    { readonly parent: RunBudget; readonly child: RunBudget },
    RunBudgetExhausted | RunBudgetGrantWidened
  >
  (
    parent: RunBudget,
    grant: BudgetLimits,
  ): Effect.Effect<
    { readonly parent: RunBudget; readonly child: RunBudget },
    RunBudgetExhausted | RunBudgetGrantWidened
  >
} = Function.dual(
  2,
  (
    parent: RunBudget,
    grant: BudgetLimits,
  ): Effect.Effect<
    { readonly parent: RunBudget; readonly child: RunBudget },
    RunBudgetExhausted | RunBudgetGrantWidened
  > =>
    Effect.gen(function* () {
      const validatedGrant = yield* Schema.decodeUnknownEffect(BudgetLimits, { onExcessProperty: "error" })(grant).pipe(
        Effect.mapError((error) =>
          RunBudgetGrantWidened.make({ dimension: "modelCalls", grant: 0, remaining: 0, message: error.message }),
        ),
      )
      const maxDepth = parent.allocation.depth
      const childDepth = parent.depth + 1
      if (maxDepth !== undefined && childDepth > maxDepth) {
        return yield* RunBudgetExhausted.make({
          dimension: "depth",
          requested: childDepth,
          remaining: maxDepth,
        })
      }
      if (parent.remaining.childRuns !== undefined && parent.remaining.childRuns < 1) {
        return yield* RunBudgetExhausted.make({
          dimension: "childRuns",
          requested: 1,
          remaining: parent.remaining.childRuns,
        })
      }
      const reserved = yield* subtractLimits(parent.remaining, validatedGrant)
      const childRunsRemaining =
        parent.remaining.childRuns === undefined
          ? undefined
          : yield* subtractFinite(parent.remaining.childRuns, 1, "childRuns")
      return {
        parent: {
          ...parent,
          remaining: {
            ...reserved,
            ...(childRunsRemaining === undefined ? {} : { childRuns: childRunsRemaining }),
          },
        },
        child: {
          allocation: validatedGrant,
          remaining: { ...validatedGrant },
          depth: childDepth,
        },
      }
    }),
)

const allocationRefund = (allocation: BudgetLimits, narrower: BudgetLimits): BudgetLimits => {
  const refunded: Record<string, number> = {}
  for (const dimension of limitDimensions) {
    const current = allocation[dimension]
    const next = narrower[dimension]
    if (current === undefined || next === undefined) continue
    if (current > next) refunded[dimension] = current - next
  }
  return refunded as BudgetLimits
}

const intersectLimits = (current: BudgetLimits, cap: BudgetLimits): BudgetLimits => {
  const next: Record<string, number | string | undefined> = { ...current }
  for (const dimension of limitDimensions) {
    const capValue = cap[dimension]
    if (capValue === undefined) continue
    const currentValue = current[dimension]
    next[dimension] = currentValue === undefined ? capValue : Math.min(currentValue, capValue)
  }
  if (cap.deadline !== undefined) next.deadline = cap.deadline
  return next as BudgetLimits
}

/** @experimental */
export const narrowChild: {
  (
    child: RunBudget,
    narrower: BudgetLimits,
  ): (
    parent: RunBudget,
  ) => Effect.Effect<{ readonly parent: RunBudget; readonly child: RunBudget }, RunBudgetGrantWidened>
  (
    parent: RunBudget,
    child: RunBudget,
    narrower: BudgetLimits,
  ): Effect.Effect<{ readonly parent: RunBudget; readonly child: RunBudget }, RunBudgetGrantWidened>
} = Function.dual(
  3,
  (
    parent: RunBudget,
    child: RunBudget,
    narrower: BudgetLimits,
  ): Effect.Effect<{ readonly parent: RunBudget; readonly child: RunBudget }, RunBudgetGrantWidened> =>
    Effect.gen(function* () {
      const validatedNarrower = yield* Schema.decodeUnknownEffect(BudgetLimits, { onExcessProperty: "error" })(
        narrower,
      ).pipe(
        Effect.mapError((error) =>
          RunBudgetGrantWidened.make({ dimension: "modelCalls", grant: 0, remaining: 0, message: error.message }),
        ),
      )
      for (const dimension of [...chargeDimensions, "childRuns", "depth"] as const) {
        const next = validatedNarrower[dimension]
        if (next === undefined) continue
        const current = child.allocation[dimension]
        if (current !== undefined && next > current) {
          return yield* RunBudgetGrantWidened.make({
            dimension,
            grant: next,
            remaining: current,
          })
        }
      }
      const refunded = allocationRefund(child.allocation, validatedNarrower)
      return {
        parent: { ...parent, remaining: mergeRemaining(parent.remaining, refunded) },
        child: {
          allocation: narrower,
          remaining: intersectLimits(child.remaining, narrower),
          depth: child.depth,
        },
      }
    }),
)

/** @experimental */
export const refundUnused: {
  (child: RunBudget): (parent: RunBudget) => RunBudget
  (parent: RunBudget, child: RunBudget): RunBudget
} = Function.dual(
  2,
  (parent: RunBudget, child: RunBudget): RunBudget => ({
    ...parent,
    remaining: mergeRemaining(parent.remaining, child.remaining),
  }),
)

/** @experimental */
export const isDeadlineExpired: {
  (nowIso: string): (budget: RunBudget) => boolean
  (budget: RunBudget, nowIso: string): boolean
} = Function.dual(2, (budget: RunBudget, nowIso: string): boolean => {
  const deadline = budget.remaining.deadline ?? budget.allocation.deadline
  return deadline !== undefined && nowIso >= deadline
})

/** @experimental */
export const assertNotExpired: {
  (nowIso: string): (budget: RunBudget) => Effect.Effect<void, RunBudgetExhausted>
  (budget: RunBudget, nowIso: string): Effect.Effect<void, RunBudgetExhausted>
} = Function.dual(
  2,
  (budget: RunBudget, nowIso: string): Effect.Effect<void, RunBudgetExhausted> =>
    isDeadlineExpired(budget, nowIso)
      ? Effect.fail(RunBudgetExhausted.make({ dimension: "deadline", requested: 1 }))
      : Effect.void,
)

/** @experimental */
export const resolve: {
  (runOverride?: BudgetLimits): (agentDefault?: BudgetLimits) => RunBudget
  (agentDefault?: BudgetLimits, runOverride?: BudgetLimits): RunBudget
} = Function.dual(
  2,
  (agentDefault: BudgetLimits | undefined, runOverride: BudgetLimits | undefined): RunBudget =>
    make(runOverride === undefined ? (agentDefault ?? {}) : narrowLimits(agentDefault ?? {}, runOverride)),
)

/** @experimental Narrow a base budget with optional per-run overrides; omitted dimensions stay unchanged. */
export const narrowLimits: {
  (override?: BudgetLimits): (base?: BudgetLimits) => BudgetLimits
  (base?: BudgetLimits, override?: BudgetLimits): BudgetLimits
} = Function.dual(
  2,
  (base: BudgetLimits | undefined, override: BudgetLimits | undefined): BudgetLimits =>
    override === undefined ? (base ?? {}) : intersectLimits(base ?? {}, override),
)

const isParseOptions = (value: unknown): value is ParseOptions =>
  typeof value === "object" &&
  value !== null &&
  ("errors" in value ||
    "onExcessProperty" in value ||
    "propertyOrder" in value ||
    "disableChecks" in value ||
    "concurrency" in value)

/** @experimental */
export const encode: {
  (input: RunBudget, options?: ParseOptions): Effect.Effect<typeof RunBudget.Encoded, Schema.SchemaError, never>
  (options?: ParseOptions): (input: RunBudget) => Effect.Effect<typeof RunBudget.Encoded, Schema.SchemaError, never>
} = Function.dual(
  (args) => args.length > 1 || (args.length === 1 && !isParseOptions(args[0])),
  (input: RunBudget, options?: ParseOptions): Effect.Effect<typeof RunBudget.Encoded, Schema.SchemaError, never> =>
    Schema.encodeEffect(RunBudget)(input, options),
)

/** @experimental */
export const decode: {
  (input: typeof RunBudget.Encoded, options?: ParseOptions): Effect.Effect<RunBudget, Schema.SchemaError, never>
  (options?: ParseOptions): (input: typeof RunBudget.Encoded) => Effect.Effect<RunBudget, Schema.SchemaError, never>
} = Function.dual(
  (args) => args.length > 1 || (args.length === 1 && !isParseOptions(args[0])),
  (input: typeof RunBudget.Encoded, options?: ParseOptions): Effect.Effect<RunBudget, Schema.SchemaError, never> =>
    Schema.decodeEffect(RunBudget)(input, options),
)
