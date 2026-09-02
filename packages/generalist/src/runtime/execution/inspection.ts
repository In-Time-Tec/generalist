import { Effect, Equal, Function, Option } from "effect"
import { RuntimeUnavailable } from "../errors.js"
import type { RunEvent } from "../run/event.js"
import {
  isTerminal,
  type CompactionInspection,
  type RawUsageFact,
  type RunInspection,
  type RunOutcome,
} from "../run.js"
import type { Checkpoint, Inspection, TreeRunInspection } from "../tree.js"
import {
  extend as extendBudget,
  inspect as inspectBudget,
  make as makeBudget,
  type Remaining,
  type Spend,
} from "../../core/durable/run-budget.js"
import { cost as modelCost } from "../../ai/model-catalog.js"
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

const outcomeFor = (run: InspectionRun): Effect.Effect<RunOutcome | void, RuntimeUnavailable> => {
  const terminalEvents = run.events.filter(
    (event) => event._tag === "RunCompleted" || event._tag === "RunFailed" || event._tag === "RunCancelled",
  )
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

type CallStarted = Extract<RunEvent, { readonly _tag: "ModelCallStarted" }>
type ModelAttemptTerminal = Extract<RunEvent, { readonly _tag: "ModelAttemptCompleted" | "ModelAttemptFailed" }>

interface FactProjection {
  readonly facts: Array<RawUsageFact>
  readonly attempts: Map<string, RawUsageFact>
  readonly attemptEvents: Map<string, RunEvent>
  readonly attemptMappings: Map<string, string>
}

interface RunFactProjection {
  readonly calls: Map<string, CallStarted>
  readonly callsWithAttempts: Set<string>
}

const recordModelCall = (
  runId: string,
  event: CallStarted,
  projection: RunFactProjection,
): Effect.Effect<void, RuntimeUnavailable> => {
  const key = `${runId}\u0000${event.modelCallId}`
  const previous = projection.calls.get(key)
  if (previous !== undefined && !Equal.equals(previous, event)) {
    return Effect.fail(corruption(`Conflicting model call ${event.modelCallId} in Run ${runId}`))
  }
  if (previous !== undefined && projection.callsWithAttempts.has(key)) {
    return Effect.fail(corruption(`Model call ${event.modelCallId} start replayed after an attempt terminal`))
  }
  projection.calls.set(key, event)
  return Effect.void
}

const usageFactFor = (runId: string, call: CallStarted, event: ModelAttemptTerminal): RawUsageFact | undefined => {
  const common = Object.assign(
    {
      runId,
      turn: event.turn,
      purpose: call.purpose,
      modelCallId: event.modelCallId,
      modelAttemptId: event.modelAttemptId,
      attempt: event.attempt,
    },
    call.provider === undefined ? undefined : { provider: call.provider },
    call.model === undefined ? undefined : { model: call.model },
  )
  if (event._tag === "ModelAttemptCompleted") {
    return {
      _tag: "Completed",
      ...common,
      usageAt: event.usageAt,
      usage: event.usage,
      ...Object.assign({}, event.requestId === undefined ? undefined : { requestId: event.requestId }),
      ...Object.assign({}, event.responseModel === undefined ? undefined : { responseModel: event.responseModel }),
      ...Object.assign({}, event.serviceTier === undefined ? undefined : { serviceTier: event.serviceTier }),
    }
  }
  return event.providerUsage === undefined
    ? undefined
    : {
        _tag: "Failed",
        ...common,
        category: event.category,
        usageAt: event.failedAt,
        providerUsage: event.providerUsage,
      }
}

const recordModelAttempt = (
  runId: string,
  event: ModelAttemptTerminal,
  projection: FactProjection,
  runProjection: RunFactProjection,
): Effect.Effect<void, RuntimeUnavailable> =>
  Effect.gen(function* () {
    const eventKey = `${runId}\u0000${event.modelAttemptId}`
    const previousEvent = projection.attemptEvents.get(eventKey)
    if (previousEvent !== undefined) {
      if (!Equal.equals(previousEvent, event))
        return yield* corruption(`Conflicting model attempt ${event.modelAttemptId}`)
      return
    }
    projection.attemptEvents.set(eventKey, event)
    const callKey = `${runId}\u0000${event.modelCallId}`
    const call = runProjection.calls.get(callKey)
    if (call === undefined)
      return yield* corruption(`Model attempt ${event.modelAttemptId} has no canonical call start`)
    if (call.turn !== event.turn)
      return yield* corruption(`Model attempt ${event.modelAttemptId} disagrees with its call turn`)
    runProjection.callsWithAttempts.add(callKey)
    const mappingKey = `${callKey}\u0000${event.attempt}`
    const mappedAttemptId = projection.attemptMappings.get(mappingKey)
    if (mappedAttemptId !== undefined && mappedAttemptId !== event.modelAttemptId) {
      return yield* corruption(
        `Model call ${event.modelCallId} attempt ${event.attempt} maps to conflicting attempt IDs`,
      )
    }
    projection.attemptMappings.set(mappingKey, event.modelAttemptId)
    const fact = usageFactFor(runId, call, event)
    if (fact === undefined) return
    const previous = projection.attempts.get(eventKey)
    if (previous !== undefined) {
      if (!Equal.equals(previous, fact)) return yield* corruption(`Conflicting model attempt ${event.modelAttemptId}`)
      return
    }
    projection.attempts.set(eventKey, fact)
    projection.facts.push(fact)
  })

const factsForRuns = (
  runs: ReadonlyArray<{ readonly runId: string; readonly events: ReadonlyArray<RunEvent> }>,
): Effect.Effect<ReadonlyArray<RawUsageFact>, RuntimeUnavailable> =>
  Effect.gen(function* () {
    const projection: FactProjection = {
      facts: [],
      attempts: new Map(),
      attemptEvents: new Map(),
      attemptMappings: new Map(),
    }
    for (const run of runs) {
      const runProjection: RunFactProjection = { calls: new Map(), callsWithAttempts: new Set() }
      for (const event of run.events) {
        if (event._tag === "ModelCallStarted") {
          yield* recordModelCall(run.runId, event, runProjection)
          continue
        }
        if (event._tag !== "ModelAttemptCompleted" && event._tag !== "ModelAttemptFailed") continue
        yield* recordModelAttempt(run.runId, event, projection, runProjection)
      }
    }
    return projection.facts
  })

const factsFor = (runs: ReadonlyArray<InspectionRun>) =>
  factsForRuns(runs.map((run) => ({ runId: run.inspection.runId, events: run.events })))

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

const factTokens = (fact: RawUsageFact): number => {
  if (fact._tag === "Failed") {
    return (
      fact.providerUsage.totalTokens ?? (fact.providerUsage.inputTokens ?? 0) + (fact.providerUsage.outputTokens ?? 0)
    )
  }
  return (fact.usage.inputTokens.total ?? 0) + (fact.usage.outputTokens.total ?? 0)
}

/** Project spend exclusively from canonical Run events. */
export const spendForEvents = (events: ReadonlyArray<RunEvent>): Effect.Effect<Spend, RuntimeUnavailable> =>
  Effect.gen(function* () {
    const accepted = events.find((event) => event._tag === "RunAccepted")
    const usage = yield* factsForRuns([{ runId: accepted?.rootRunId ?? "", events }])
    let usd: number | "unknown" = 0
    for (const fact of usage) {
      if (fact._tag === "Failed" || fact.provider === undefined || fact.model === undefined) {
        usd = "unknown"
        continue
      }
      const priced = yield* modelCost({ provider: fact.provider, model: fact.model }, fact.usage)
      if (Option.isNone(priced)) usd = "unknown"
      else if (usd !== "unknown") usd += priced.value
    }
    const duration = yield* durationForEvents(events)
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
    return {
      tokens: usage.reduce((total, fact) => total + factTokens(fact), 0) + reserved("tokens") + settledAmount("tokens"),
      usd: usd === "unknown" || settledUnknownUsd ? "unknown" : usd + reserved("usd") + settledAmount("usd"),
      duration: duration + reserved("duration") + settledAmount("duration"),
      toolCalls:
        events.filter((event) => event._tag === "ToolExecutionStarted").length +
        reserved("toolCalls") +
        settledAmount("toolCalls"),
      children: activeChildren + settled.length + settledAmount("children"),
    }
  })

/** Project remaining budget exclusively from canonical Run events. */
export const budgetForEvents = (events: ReadonlyArray<RunEvent>): Effect.Effect<Remaining, RuntimeUnavailable> =>
  Effect.gen(function* () {
    const accepted = events.find((event) => event._tag === "RunAccepted")
    let budget = makeBudget(accepted?._tag === "RunAccepted" ? (accepted.budget ?? {}) : {})
    for (const event of events) if (event._tag === "BudgetExtended") budget = extendBudget(budget, event.delta)
    return inspectBudget(budget, yield* spendForEvents(events))
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
      budget: yield* budgetForEvents(run.events),
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
