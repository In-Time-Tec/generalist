import { factsForRuns, spendForUsage } from "./inspection-usage.js"
import { Effect, Equal, Function } from "effect"
import { RuntimeUnavailable } from "../errors.js"
import type { RunEvent } from "../run/event.js"
import { isTerminal, type CompactionInspection, type RunInspection, type RunOutcome } from "../run.js"
import type { Checkpoint, Inspection, TreeRunInspection } from "../tree.js"
import {
  extend as extendBudget,
  inspect as inspectBudget,
  make as makeBudget,
  type Remaining,
  type Spend,
} from "../../core/durable/run-budget.js"
import { durationForEvents } from "../budget/state.js"
import type { Result as GateResult } from "../../core/agent/gates/definition.js"

export interface InspectionRun {
  readonly inspection: RunInspection
  readonly rootRunId: string
  readonly parentRunId?: string
  readonly invocationId?: string
  readonly terminalEventId?: string
  readonly events: ReadonlyArray<RunEvent>
  readonly firstTreePosition: number
}

const corruption = (message: string) => RuntimeUnavailable.make({ message })

const allocationBoundary = (events: ReadonlyArray<RunEvent>) =>
  events.findLastIndex((event) => event._tag === "RunForked" && event.role !== "source")

/** Inherited events retain receipts, but never count as newly incurred target spend. */
const allocationEvents = (events: ReadonlyArray<RunEvent>): ReadonlyArray<RunEvent> => {
  const boundary = allocationBoundary(events)
  return boundary < 0 ? events : events.slice(boundary + 1)
}

const outcomeFor = (run: InspectionRun): Effect.Effect<RunOutcome | void, RuntimeUnavailable> => {
  const boundary = run.events.findLastIndex(
    (event) => event._tag === "RunRewound" || (event._tag === "RunForked" && event.role !== "source"),
  )
  const terminalEvents = run.events
    .slice(boundary + 1)
    .filter((event) => event._tag === "RunCompleted" || event._tag === "RunFailed" || event._tag === "RunCancelled")
  if (!isTerminal(run.inspection.status)) {
    return terminalEvents.length === 0
      ? Effect.void
      : Effect.fail(corruption(`Non-terminal Run ${run.inspection.runId} has a terminal event`))
  }
  const event = terminalEvents.find((candidate) => candidate.eventId === run.terminalEventId)
  if (event === undefined || terminalEvents.length !== 1) {
    return Effect.fail(corruption(`Run ${run.inspection.runId} terminal row and event do not match`))
  }
  if (run.inspection.status === "succeeded" && event._tag === "RunCompleted") {
    return Effect.succeed({
      _tag: "Succeeded",
      result: event.result,
      eventId: event.eventId,
      occurredAt: event.occurredAt,
    })
  }
  if (run.inspection.status === "failed" && event._tag === "RunFailed") {
    return Effect.succeed({ _tag: "Failed", error: event.error, eventId: event.eventId, occurredAt: event.occurredAt })
  }
  if (run.inspection.status === "cancelled" && event._tag === "RunCancelled") {
    const outcome = {
      _tag: "Cancelled",
      eventId: event.eventId,
      occurredAt: event.occurredAt,
    } as const
    return Effect.succeed(event.reason === undefined ? outcome : { ...outcome, reason: event.reason })
  }
  return Effect.fail(corruption(`Run ${run.inspection.runId} terminal status and event disagree`))
}

const factsFor = (runs: ReadonlyArray<InspectionRun>) =>
  factsForRuns(runs.map((run) => ({ runId: run.inspection.runId, events: allocationEvents(run.events) })))

const gatesFor = (run: InspectionRun): Effect.Effect<ReadonlyArray<GateResult>, RuntimeUnavailable> =>
  Effect.gen(function* () {
    const results: Array<GateResult> = []
    const seen = new Map<string, GateResult>()
    for (const event of run.events) {
      if (event._tag !== "GateResult") continue
      const key = `${event.turn}\u0000${event.name}`
      const result: GateResult = { name: event.name, verdict: event.verdict, evidence: event.evidence }
      const previous = seen.get(key)
      if (previous !== undefined) {
        if (!Equal.equals(previous, result)) return yield* corruption(`Conflicting completion gate ${event.name}`)
        continue
      }
      seen.set(key, result)
      results.push(result)
    }
    return results
  })

/** Project spend exclusively from canonical Run events. */
export const spendForEvents = Effect.fn("RuntimeInspection.spendForEvents")(function* (input: {
  readonly events: ReadonlyArray<RunEvent>
  readonly observedMillis?: number | undefined
}): Effect.fn.Return<Spend, RuntimeUnavailable> {
  const events = allocationEvents(input.events)
  const observedMillis = input.observedMillis
  const accepted = events.find((event) => event._tag === "RunAccepted")
  const usage = yield* factsForRuns([{ runId: events[0]?.runId ?? accepted?.rootRunId ?? "", events }])
  const modelSpend = yield* spendForUsage({ events, usage })
  const duration = yield* durationForEvents({ events, observedMillis })
  const linked = new Set(events.filter((event) => event._tag === "ChildLinked").map((event) => event.childRunId))
  for (const event of events) if (event._tag === "ChildSettled") linked.delete(event.childRunId)
  const reservations = events.filter((event) => event._tag === "ChildLinked" && linked.has(event.childRunId))
  const reserved = (dimension: "tokens" | "usd" | "duration" | "toolCalls") =>
    reservations.reduce(
      (total, event) => total + (event._tag === "ChildLinked" ? (event.budget?.[dimension] ?? 0) : 0),
      0,
    )
  const settled = events.filter((event) => event._tag === "ChildSettled" && event.spend !== undefined)
  const settledAmount = (dimension: "tokens" | "usd" | "duration" | "toolCalls" | "children") =>
    settled.reduce((total, event) => {
      if (event._tag !== "ChildSettled") return total
      const value = event.spend?.[dimension]
      return total + (value === undefined || value === "unknown" ? 0 : value)
    }, 0)
  const settledUnknownUsd = settled.some((event) => event._tag === "ChildSettled" && event.spend?.usd === "unknown")
  const activeChildren = reservations.reduce(
    (total, event) => total + (event._tag === "ChildLinked" ? 1 + (event.budget?.children ?? 0) : 0),
    0,
  )
  const forks = events.filter(
    (event): event is Extract<RunEvent, { readonly _tag: "RunForked" }> =>
      event._tag === "RunForked" && event.role === "source",
  )
  const forkAllocation = (dimension: "tokens" | "usd" | "duration" | "toolCalls" | "children") =>
    forks.reduce((total, event) => total + (event.budget[dimension] ?? 0), 0)
  return {
    tokens: modelSpend.tokens + reserved("tokens") + settledAmount("tokens") + forkAllocation("tokens"),
    usd:
      modelSpend.usd === "unknown" || settledUnknownUsd
        ? "unknown"
        : modelSpend.usd + reserved("usd") + settledAmount("usd") + forkAllocation("usd"),
    duration: duration + reserved("duration") + settledAmount("duration") + forkAllocation("duration"),
    toolCalls:
      events.filter((event) => event._tag === "ToolExecutionStarted").length +
      reserved("toolCalls") +
      settledAmount("toolCalls") +
      forkAllocation("toolCalls"),
    children: activeChildren + settled.length + settledAmount("children") + forks.length + forkAllocation("children"),
  }
})

/** Project remaining budget exclusively from canonical Run events. */
export const budgetForEvents = Effect.fn("RuntimeInspection.budgetForEvents")(function* (input: {
  readonly events: ReadonlyArray<RunEvent>
  readonly observedMillis?: number | undefined
}): Effect.fn.Return<Remaining, RuntimeUnavailable> {
  const { events, observedMillis } = input
  const boundary = events.findLastIndex(
    (event) =>
      (event._tag === "RunForked" && event.role !== "source") ||
      (event._tag === "RunRewound" && event.allocation !== undefined),
  )
  const allocation = events[boundary]
  const accepted = events.find((event) => event._tag === "RunAccepted")
  let limits = accepted?._tag === "RunAccepted" ? (accepted.budget ?? {}) : {}
  if (allocation?._tag === "RunForked") limits = allocation.budget
  else if (allocation?._tag === "RunRewound") limits = allocation.allocation!.budget
  let budget = makeBudget(limits)
  for (let index = boundary + 1; index < events.length; index++) {
    const event = events[index]!
    if (event._tag === "BudgetExtended") budget = extendBudget(budget, event.delta)
  }
  const spend = yield* spendForEvents({ events, observedMillis })
  if (allocation?._tag !== "RunRewound") return inspectBudget(budget, spend)
  const baseline = allocation.allocation!.baseline
  return inspectBudget(budget, {
    tokens: Math.max(0, spend.tokens - baseline.tokens),
    usd: spend.usd === "unknown" || baseline.usd === "unknown" ? "unknown" : Math.max(0, spend.usd - baseline.usd),
    duration: Math.max(0, spend.duration - baseline.duration),
    toolCalls: Math.max(0, spend.toolCalls - baseline.toolCalls),
    children: Math.max(0, spend.children - baseline.children),
  })
})

type CompactionTerminal = Extract<
  RunEvent,
  { readonly _tag: "CompactionSkipped" | "CompactionApplied" | "CompactionFailed" }
>
const compactionActions = {
  CompactionSkipped: "skipped",
  CompactionApplied: "applied",
  CompactionFailed: "failed",
} satisfies Record<CompactionTerminal["_tag"], "skipped" | "applied" | "failed">

interface CompactionProjection {
  readonly state: CompactionInspection
  readonly terminal?: RunEvent
  readonly skipped?: boolean
}

const recordCompactionStart = (
  runId: string,
  event: Extract<RunEvent, { readonly _tag: "CompactionStarted" }>,
  key: string,
  states: Map<string, CompactionProjection>,
): Effect.Effect<void, RuntimeUnavailable> => {
  const state: CompactionInspection = {
    _tag: "Running",
    runId,
    turn: event.turn,
    compactionId: event.compactionId,
    startedAt: event.startedAt,
    trigger: event.trigger,
    ...Object.assign(
      {},
      event.contextTokensBefore === undefined ? undefined : { contextTokensBefore: event.contextTokensBefore },
    ),
    ...Object.assign({}, event.entriesBefore === undefined ? undefined : { entriesBefore: event.entriesBefore }),
  }
  const previous = states.get(key)
  if (previous !== undefined && (previous.terminal !== undefined || !Equal.equals(previous.state, state))) {
    return Effect.fail(corruption(`Conflicting compaction start ${event.compactionId} in Run ${runId}`))
  }
  if (previous === undefined) states.set(key, { state })
  return Effect.void
}

const startedCompaction = (
  event: CompactionTerminal,
  action: "skipped" | "applied" | "failed",
  key: string,
  states: Map<string, CompactionProjection>,
): Effect.Effect<CompactionProjection | undefined, RuntimeUnavailable> => {
  const started = states.get(key)
  if (started === undefined) return Effect.fail(corruption(`Compaction ${event.compactionId} ${action} without start`))
  if (started.state.turn !== event.turn) {
    return Effect.fail(corruption(`Compaction ${event.compactionId} terminal turn disagrees with start`))
  }
  if (
    event._tag === "CompactionApplied" &&
    (event.commit.compactionId !== event.compactionId || event.commit.checkpointId !== event.checkpointId)
  ) {
    return Effect.fail(corruption(`Compaction ${event.compactionId} commit identity disagrees with application`))
  }
  if (started.terminal !== undefined && !Equal.equals(started.terminal, event)) {
    return Effect.fail(corruption(`Conflicting terminal compaction ${event.compactionId}`))
  }
  return Effect.succeed(started.terminal === undefined ? started : undefined)
}

const recordCompactionTerminal = (
  event: CompactionTerminal,
  key: string,
  states: Map<string, CompactionProjection>,
): Effect.Effect<void, RuntimeUnavailable> =>
  Effect.gen(function* () {
    const started = yield* startedCompaction(event, compactionActions[event._tag], key, states)
    if (event._tag === "CompactionApplied") {
      if (started !== undefined) {
        states.set(key, {
          state: {
            ...started.state,
            _tag: "Applied",
            checkpointId: event.checkpointId,
            appliedAt: event.appliedAt,
            kind: event.kind,
            commit: event.commit,
          },
          terminal: event,
        })
      }
      return
    }
    if (started === undefined) return
    if (event._tag === "CompactionSkipped") {
      states.set(key, { ...started, terminal: event, skipped: true })
      return
    }
    states.set(key, {
      state: { ...started.state, _tag: "Failed", failedAt: event.failedAt },
      terminal: event,
    })
  })

const compactionsFor = (
  runs: ReadonlyArray<InspectionRun>,
): Effect.Effect<ReadonlyArray<CompactionInspection>, RuntimeUnavailable> =>
  Effect.gen(function* () {
    const states = new Map<string, CompactionProjection>()
    for (const run of runs) {
      for (const event of run.events) {
        if (event._tag === "CompactionStarted") {
          const key = `${run.inspection.runId}\u0000${event.compactionId}`
          yield* recordCompactionStart(run.inspection.runId, event, key, states)
        } else if (
          event._tag === "CompactionSkipped" ||
          event._tag === "CompactionApplied" ||
          event._tag === "CompactionFailed"
        ) {
          const key = `${run.inspection.runId}\u0000${event.compactionId}`
          yield* recordCompactionTerminal(event, key, states)
        }
      }
    }
    return [...states.values()].flatMap(({ skipped, state }) => (skipped === true ? [] : [state]))
  })

export const projectRunSnapshot = (run: InspectionRun) =>
  Effect.gen(function* () {
    const outcome = yield* outcomeFor(run)
    const turn = run.events.reduce((latest, event) => ("turn" in event && event.turn > latest ? event.turn : latest), 0)
    const snapshot = {
      run: run.inspection,
      cursor: run.inspection.lastSequence,
      turn,
      usageFacts: yield* factsFor([run]),
      budget: yield* budgetForEvents({ events: run.events }),
      compactions: yield* compactionsFor([run]),
      gates: yield* gatesFor(run),
    }
    return outcome === undefined ? snapshot : { ...snapshot, outcome }
  })

interface ProjectedTreeRun {
  run: RunInspection
  parentRunId?: string
  invocationId?: string
  outcome?: RunOutcome
}

export const projectTreeCheckpoint: {
  (
    cursor: import("../tree/cursor.js").TreeCursor,
    input: ReadonlyArray<InspectionRun>,
  ): (rootRunId: string) => Effect.Effect<Checkpoint, RuntimeUnavailable>
  (
    rootRunId: string,
    cursor: import("../tree/cursor.js").TreeCursor,
    input: ReadonlyArray<InspectionRun>,
  ): Effect.Effect<Checkpoint, RuntimeUnavailable>
} = Function.dual(
  3,
  (rootRunId: string, cursor: import("../tree/cursor.js").TreeCursor, input: ReadonlyArray<InspectionRun>) =>
    Effect.gen(function* () {
      const positions = new Set<number>()
      for (const run of input) {
        if (!Number.isSafeInteger(run.firstTreePosition) || run.firstTreePosition < 0) {
          return yield* corruption(`Run ${run.inspection.runId} has no canonical first tree position`)
        }
        if (positions.has(run.firstTreePosition)) {
          return yield* corruption(`Tree ${rootRunId} has duplicate first position ${run.firstTreePosition}`)
        }
        positions.add(run.firstTreePosition)
      }
      const runs = [...input].toSorted(
        (left, right) =>
          left.firstTreePosition - right.firstTreePosition ||
          left.inspection.runId.localeCompare(right.inspection.runId),
      )
      const inspected = yield* Effect.forEach(runs, (item) =>
        outcomeFor(item).pipe(
          Effect.map((outcome) => {
            const projected: ProjectedTreeRun = { run: item.inspection }
            if (item.parentRunId !== undefined) projected.parentRunId = item.parentRunId
            if (item.invocationId !== undefined) projected.invocationId = item.invocationId
            if (outcome !== undefined) projected.outcome = outcome
            return projected satisfies TreeRunInspection
          }),
        ),
      )
      const activeRunIds = inspected.filter(({ run }) => !isTerminal(run.status)).map(({ run }) => run.runId)
      const common = {
        rootRunId,
        runs: inspected,
        usageFacts: yield* factsFor(runs),
        compactions: yield* compactionsFor(runs),
      }
      const inspection: Inspection =
        activeRunIds.length === 0
          ? ({ _tag: "Terminal", ...common } as const)
          : ({ _tag: "Active", ...common, activeRunIds } as const)
      return { inspection, cursor }
    }),
)
