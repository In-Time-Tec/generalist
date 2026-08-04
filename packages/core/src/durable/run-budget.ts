import { Effect, Schema } from "effect"

/** @experimental Finite resource limits for one run or child grant. */
export const BudgetLimits = Schema.Struct({
  modelCalls: Schema.optionalKey(Schema.Finite),
  toolCalls: Schema.optionalKey(Schema.Finite),
  totalTokens: Schema.optionalKey(Schema.Finite),
  childRuns: Schema.optionalKey(Schema.Finite),
  handoffs: Schema.optionalKey(Schema.Finite),
  depth: Schema.optionalKey(Schema.Finite),
  deadline: Schema.optionalKey(Schema.String),
})

/** @experimental */
export type BudgetLimits = typeof BudgetLimits.Type

/** @experimental Portable run budget with allocation, remaining capacity, and tree depth. */
export const RunBudget = Schema.Struct({
  allocation: BudgetLimits,
  remaining: BudgetLimits,
  depth: Schema.Finite,
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
  },
) {}

/** @experimental */
export class RunBudgetGrantWidened extends Schema.TaggedErrorClass<RunBudgetGrantWidened>()(
  "@batonfx/core/RunBudgetGrantWidened",
  {
    dimension: Schema.Literals(["modelCalls", "toolCalls", "totalTokens", "childRuns", "handoffs", "depth"]),
    grant: Schema.Finite,
    remaining: Schema.Finite,
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
  if (amount === 0) return Effect.succeed(remaining)
  if (remaining === undefined) return Effect.succeed(undefined)
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
export const make = (allocation: BudgetLimits, depth = 0): RunBudget => ({
  allocation,
  remaining: { ...allocation },
  depth,
})

/** @experimental */
export const allocate = make

/** @experimental */
export const charge = (budget: RunBudget, usage: BudgetLimits): Effect.Effect<RunBudget, RunBudgetExhausted> =>
  Effect.gen(function* () {
    const remaining: Record<string, number | string | undefined> = { ...budget.remaining }
    for (const dimension of chargeDimensions) {
      const amount = usage[dimension]
      if (amount === undefined || amount === 0) continue
      remaining[dimension] = yield* subtractFinite(limitValue(remaining as BudgetLimits, dimension), amount, dimension)
    }
    if (usage.handoffs !== undefined && usage.handoffs !== 0) {
      remaining.handoffs = yield* subtractFinite(
        limitValue(remaining as BudgetLimits, "handoffs"),
        usage.handoffs,
        "handoffs",
      )
    }
    return { ...budget, remaining: remaining as BudgetLimits }
  })

/** @experimental */
export const reserveChild = (
  parent: RunBudget,
  grant: BudgetLimits,
): Effect.Effect<
  { readonly parent: RunBudget; readonly child: RunBudget },
  RunBudgetExhausted | RunBudgetGrantWidened
> =>
  Effect.gen(function* () {
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
    const reserved = yield* subtractLimits(parent.remaining, grant)
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
        allocation: grant,
        remaining: { ...grant },
        depth: childDepth,
      },
    }
  })

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
export const narrowChild = (
  parent: RunBudget,
  child: RunBudget,
  narrower: BudgetLimits,
): Effect.Effect<{ readonly parent: RunBudget; readonly child: RunBudget }, RunBudgetGrantWidened> =>
  Effect.gen(function* () {
    for (const dimension of [...chargeDimensions, "childRuns", "depth"] as const) {
      const next = narrower[dimension]
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
    const refunded = allocationRefund(child.allocation, narrower)
    return {
      parent: { ...parent, remaining: mergeRemaining(parent.remaining, refunded) },
      child: {
        allocation: narrower,
        remaining: intersectLimits(child.remaining, narrower),
        depth: child.depth,
      },
    }
  })

/** @experimental */
export const refundUnused = (parent: RunBudget, child: RunBudget): RunBudget => ({
  ...parent,
  remaining: mergeRemaining(parent.remaining, child.remaining),
})

/** @experimental */
export const isDeadlineExpired = (budget: RunBudget, nowIso: string): boolean => {
  const deadline = budget.remaining.deadline ?? budget.allocation.deadline
  return deadline !== undefined && nowIso >= deadline
}

/** @experimental */
export const assertNotExpired = (budget: RunBudget, nowIso: string): Effect.Effect<void, RunBudgetExhausted> =>
  isDeadlineExpired(budget, nowIso)
    ? Effect.fail(RunBudgetExhausted.make({ dimension: "deadline", requested: 1 }))
    : Effect.void

/** @experimental */
export const resolve = (agentDefault?: BudgetLimits, runOverride?: BudgetLimits): RunBudget =>
  make(runOverride === undefined ? (agentDefault ?? {}) : narrowLimits(agentDefault ?? {}, runOverride))

/** @experimental Narrow a base budget with optional per-run overrides; omitted dimensions stay unchanged. */
export const narrowLimits = (base?: BudgetLimits, override?: BudgetLimits): BudgetLimits =>
  override === undefined ? (base ?? {}) : intersectLimits(base ?? {}, override)

/** @experimental */
export const encode = Schema.encodeEffect(RunBudget)

/** @experimental */
export const decode = Schema.decodeEffect(RunBudget)
