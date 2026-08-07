import { Effect, Equal } from "effect"
import { RuntimeUnavailable } from "./errors.js"
import type { RunEvent } from "./run-event.js"
import { isTerminal, type CompactionInspection, type RawUsageFact, type RunInspection, type RunOutcome } from "./run.js"
import type { TreeRunInspection } from "./tree.js"

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
    return Effect.succeed({
      _tag: "Cancelled",
      eventId: event.eventId,
      occurredAt: event.occurredAt,
      ...(event.reason === undefined ? {} : { reason: event.reason }),
    })
  }
  return Effect.fail(corruption(`Run ${run.inspection.runId} terminal status and event disagree`))
}

const factsFor = (runs: ReadonlyArray<InspectionRun>): Effect.Effect<ReadonlyArray<RawUsageFact>, RuntimeUnavailable> =>
  Effect.gen(function* () {
    const facts: Array<RawUsageFact> = []
    const attempts = new Map<string, RawUsageFact>()
    const attemptEvents = new Map<string, RunEvent>()
    const attemptMappings = new Map<string, string>()
    for (const run of runs) {
      const calls = new Map<string, Extract<RunEvent, { readonly _tag: "ModelCallStarted" }>>()
      const callsWithAttempts = new Set<string>()
      for (const event of run.events) {
        if (event._tag === "ModelCallStarted") {
          const key = `${run.inspection.runId}\u0000${event.modelCallId}`
          const previous = calls.get(key)
          if (previous !== undefined && !Equal.equals(previous, event)) {
            return yield* corruption(`Conflicting model call ${event.modelCallId} in Run ${run.inspection.runId}`)
          }
          if (previous !== undefined && callsWithAttempts.has(key)) {
            return yield* corruption(`Model call ${event.modelCallId} start replayed after an attempt terminal`)
          }
          calls.set(key, event)
          continue
        }
        if (event._tag !== "ModelAttemptCompleted" && event._tag !== "ModelAttemptFailed") continue
        const eventKey = `${run.inspection.runId}\u0000${event.modelAttemptId}`
        const previousEvent = attemptEvents.get(eventKey)
        if (previousEvent !== undefined) {
          if (!Equal.equals(previousEvent, event)) {
            return yield* corruption(`Conflicting model attempt ${event.modelAttemptId}`)
          }
          continue
        }
        attemptEvents.set(eventKey, event)
        const call = calls.get(`${run.inspection.runId}\u0000${event.modelCallId}`)
        if (call === undefined) {
          return yield* corruption(`Model attempt ${event.modelAttemptId} has no canonical call start`)
        }
        if (call.turn !== event.turn) {
          return yield* corruption(`Model attempt ${event.modelAttemptId} disagrees with its call turn`)
        }
        callsWithAttempts.add(`${run.inspection.runId}\u0000${event.modelCallId}`)
        const mappingKey = `${run.inspection.runId}\u0000${event.modelCallId}\u0000${event.attempt}`
        const mappedAttemptId = attemptMappings.get(mappingKey)
        if (mappedAttemptId !== undefined && mappedAttemptId !== event.modelAttemptId) {
          return yield* corruption(
            `Model call ${event.modelCallId} attempt ${event.attempt} maps to conflicting attempt IDs`,
          )
        }
        attemptMappings.set(mappingKey, event.modelAttemptId)
        if (event._tag === "ModelAttemptFailed" && event.providerUsage === undefined) continue
        const common = {
          runId: run.inspection.runId,
          turn: event.turn,
          purpose: call.purpose,
          modelCallId: event.modelCallId,
          modelAttemptId: event.modelAttemptId,
          attempt: event.attempt,
          ...(call.provider === undefined ? {} : { provider: call.provider }),
          ...(call.model === undefined ? {} : { model: call.model }),
        }
        const fact: RawUsageFact =
          event._tag === "ModelAttemptCompleted"
            ? {
                _tag: "Completed",
                ...common,
                usageAt: event.usageAt,
                usage: event.usage,
                ...(event.requestId === undefined ? {} : { requestId: event.requestId }),
                ...(event.responseModel === undefined ? {} : { responseModel: event.responseModel }),
                ...(event.serviceTier === undefined ? {} : { serviceTier: event.serviceTier }),
              }
            : {
                _tag: "Failed",
                ...common,
                category: event.category,
                usageAt: event.failedAt,
                providerUsage: event.providerUsage!,
              }
        const previous = attempts.get(eventKey)
        if (previous !== undefined) {
          if (!Equal.equals(previous, fact))
            return yield* corruption(`Conflicting model attempt ${event.modelAttemptId}`)
          continue
        }
        attempts.set(eventKey, fact)
        facts.push(fact)
      }
    }
    return facts
  })

const compactionsFor = (
  runs: ReadonlyArray<InspectionRun>,
): Effect.Effect<ReadonlyArray<CompactionInspection>, RuntimeUnavailable> =>
  Effect.gen(function* () {
    const states = new Map<string, { state: CompactionInspection; terminal?: RunEvent; skipped?: boolean }>()
    for (const run of runs) {
      for (const event of run.events) {
        const key = `${run.inspection.runId}\u0000${"compactionId" in event ? event.compactionId : ""}`
        if (event._tag === "CompactionStarted") {
          const state: CompactionInspection = {
            _tag: "Running",
            runId: run.inspection.runId,
            turn: event.turn,
            compactionId: event.compactionId,
            startedAt: event.startedAt,
            trigger: event.trigger,
            ...(event.contextTokensBefore === undefined ? {} : { contextTokensBefore: event.contextTokensBefore }),
            ...(event.entriesBefore === undefined ? {} : { entriesBefore: event.entriesBefore }),
          }
          const previous = states.get(key)
          if (previous !== undefined) {
            if (previous.terminal !== undefined || !Equal.equals(previous.state, state)) {
              return yield* corruption(
                `Conflicting compaction start ${event.compactionId} in Run ${run.inspection.runId}`,
              )
            }
            continue
          }
          states.set(key, { state })
        } else if (event._tag === "CompactionSkipped") {
          const started = states.get(key)
          if (started === undefined) return yield* corruption(`Compaction ${event.compactionId} skipped without start`)
          if (started.state.turn !== event.turn)
            return yield* corruption(`Compaction ${event.compactionId} terminal turn disagrees with start`)
          if (started.terminal !== undefined) {
            if (!Equal.equals(started.terminal, event)) {
              return yield* corruption(`Conflicting terminal compaction ${event.compactionId}`)
            }
            continue
          }
          states.set(key, { ...started, terminal: event, skipped: true })
        } else if (event._tag === "CompactionApplied") {
          const started = states.get(key)
          if (started === undefined) return yield* corruption(`Compaction ${event.compactionId} applied without start`)
          if (started.state.turn !== event.turn)
            return yield* corruption(`Compaction ${event.compactionId} terminal turn disagrees with start`)
          if (event.commit.compactionId !== event.compactionId || event.commit.checkpointId !== event.checkpointId) {
            return yield* corruption(`Compaction ${event.compactionId} commit identity disagrees with application`)
          }
          if (started.terminal !== undefined) {
            if (!Equal.equals(started.terminal, event)) {
              return yield* corruption(`Conflicting terminal compaction ${event.compactionId}`)
            }
            continue
          }
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
        } else if (event._tag === "CompactionFailed") {
          const started = states.get(key)
          if (started === undefined) return yield* corruption(`Compaction ${event.compactionId} failed without start`)
          if (started.state.turn !== event.turn)
            return yield* corruption(`Compaction ${event.compactionId} terminal turn disagrees with start`)
          if (started.terminal !== undefined) {
            if (!Equal.equals(started.terminal, event)) {
              return yield* corruption(`Conflicting terminal compaction ${event.compactionId}`)
            }
            continue
          }
          states.set(key, {
            state: { ...started.state, _tag: "Failed", failedAt: event.failedAt },
            terminal: event,
          })
        }
      }
    }
    return [...states.values()].flatMap(({ skipped, state }) => (skipped === true ? [] : [state]))
  })

export const projectRunSnapshot = (run: InspectionRun) =>
  Effect.gen(function* () {
    const outcome = yield* outcomeFor(run)
    return {
      run: run.inspection,
      cursor: run.inspection.lastSequence,
      ...(outcome === undefined ? {} : { outcome }),
      usage: yield* factsFor([run]),
      compactions: yield* compactionsFor([run]),
    }
  })

export const projectTreeInspection = (
  rootRunId: string,
  cursor: import("./tree-cursor.js").TreeCursor,
  input: ReadonlyArray<InspectionRun>,
) =>
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
        left.firstTreePosition - right.firstTreePosition || left.inspection.runId.localeCompare(right.inspection.runId),
    )
    const inspected = yield* Effect.forEach(runs, (item) =>
      outcomeFor(item).pipe(
        Effect.map((outcome) => {
          const projected: {
            run: RunInspection
            parentRunId?: string
            invocationId?: string
            outcome?: RunOutcome
          } = { run: item.inspection }
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
      cursor,
      runs: inspected,
      usage: yield* factsFor(runs),
      compactions: yield* compactionsFor(runs),
    }
    return activeRunIds.length === 0
      ? ({ _tag: "Terminal", ...common } as const)
      : ({ _tag: "Active", ...common, activeRunIds } as const)
  })
