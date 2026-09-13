import { Effect, Function, type Types } from "effect"
import type { RawUsageFact, RunStatus as RuntimeRunStatus } from "../../run.js"
import { factsForRuns } from "../../execution/inspection-usage.js"
import { budgetForEvents } from "../../execution/inspection.js"
import { publicIdentity } from "../../executable/public-identity.js"
import { runWaits, type RuntimeState, type StoredRun } from "../projection.js"
import type { Child, Run, RunStatus, Session, Usage, Wait } from "../../inspection.js"

export interface InspectionProjectionFailure {
  readonly record: string
  readonly reason: "ordering" | "reference"
}

const projectionFailure = (
  record: string,
  reason: InspectionProjectionFailure["reason"] = "reference",
): InspectionProjectionFailure => ({ record, reason })

export const projectInspectionStatus = (status: RuntimeRunStatus): RunStatus => {
  switch (status) {
    case "queued":
      return "pending"
    case "needs-resolution":
      return "waiting"
    case "cancelling":
      return "running"
    default:
      return status
  }
}

const waitKind = (
  wait: RuntimeState["waits"] extends ReadonlyMap<string, infer Value> ? Value : never,
): Wait["kind"] => {
  switch (wait.reason._tag) {
    case "Approval":
      return "approval"
    case "Signal":
      return "signal"
    case "ToolWait":
      return "tool"
    case "AwaitEvent":
      return "child"
    case "Timer":
    case "External":
      return "external"
  }
}

const usage = (facts: ReadonlyArray<RawUsageFact>): Usage => {
  let inputTokens = 0
  let outputTokens = 0
  for (const fact of facts) {
    if (fact._tag === "Completed") {
      inputTokens += fact.usage.inputTokens.total ?? fact.usage.inputTokens.uncached ?? 0
      outputTokens += fact.usage.outputTokens.total ?? 0
    } else {
      inputTokens += fact.providerUsage.inputTokens ?? 0
      outputTokens += fact.providerUsage.outputTokens ?? 0
    }
  }
  return { inputTokens, outputTokens }
}

const childReadiness = (run: StoredRun): Child["readiness"] => {
  const status = projectInspectionStatus(run.status)
  if (status === "succeeded" || status === "failed" || status === "cancelled" || run.childReadiness === "settled") {
    return "terminal"
  }
  return run.childReadiness === "queued" ? "admitted" : "active"
}

const projectChild = (state: RuntimeState, childRunId: string): Effect.Effect<Child, InspectionProjectionFailure> =>
  Effect.gen(function* () {
    const run = state.runs.get(childRunId)
    if (run === undefined) return yield* Effect.fail(projectionFailure(`run:${childRunId}`))
    const identity = publicIdentity(run)
    if (identity === undefined) return yield* Effect.fail(projectionFailure(`run:${childRunId}:executable`))
    const projected: Types.Mutable<Child> = {
      childRunId,
      agent: identity.name,
      status: projectInspectionStatus(run.status),
      readiness: childReadiness(run),
    }
    if (run.invocationId !== undefined) projected.invocationId = run.invocationId
    return projected
  })

const projectRun = (state: RuntimeState, run: StoredRun): Effect.Effect<Run, InspectionProjectionFailure> =>
  Effect.gen(function* () {
    let priorSequence = -1
    for (const event of run.events) {
      if (event.sequence <= priorSequence) {
        return yield* Effect.fail(projectionFailure(`run:${run.runId}:events`, "ordering"))
      }
      priorSequence = event.sequence
    }
    if (priorSequence !== run.lastSequence) {
      return yield* Effect.fail(projectionFailure(`run:${run.runId}:lastSequence`, "ordering"))
    }
    const identity = publicIdentity(run)
    if (identity === undefined) return yield* Effect.fail(projectionFailure(`run:${run.runId}:executable`))
    const facts = yield* factsForRuns([{ runId: run.runId, events: run.events }]).pipe(
      Effect.mapError(() => projectionFailure(`run:${run.runId}:usage`)),
    )
    const waits: Array<Wait> = []
    for (const wait of runWaits(state, run.runId)) {
      if (wait.status !== "open") continue
      const opened = run.events.find((event) => event._tag === "RunWaiting" && event.wait.waitId === wait.waitId)
      if (opened === undefined) {
        return yield* Effect.fail(projectionFailure(`run:${run.runId}:wait:${wait.waitId}`))
      }
      waits.push({ id: wait.waitId, kind: waitKind(wait), openedAtSequence: opened.sequence })
      if (waits.length === 200) break
    }
    const children = yield* Effect.forEach(
      run.children.slice(0, 200),
      (childRunId) => projectInspectionChild(state, childRunId),
      {
        concurrency: 8,
      },
    )
    const projected: Types.Mutable<Run> = {
      runId: run.runId,
      sessionId: run.message.sessionId,
      rootRunId: run.rootRunId,
      agent: identity.name,
      revision: identity.revision,
      status: projectInspectionStatus(run.status),
      durability: "durable",
      depth: run.depth,
      turn: run.events.reduce((latest, event) => ("turn" in event ? Math.max(latest, event.turn) : latest), 0),
      lastSequence: run.lastSequence,
      usage: usage(facts),
      budget: yield* budgetForEvents({ events: run.events }).pipe(
        Effect.mapError(() => projectionFailure(`run:${run.runId}:budget`)),
      ),
      waits,
      children,
    }
    if (run.parentRunId !== undefined) projected.parentRunId = run.parentRunId
    return projected
  })

export const projectInspectionChild: {
  (childRunId: string): (state: RuntimeState) => Effect.Effect<Child, InspectionProjectionFailure>
  (state: RuntimeState, childRunId: string): Effect.Effect<Child, InspectionProjectionFailure>
} = Function.dual(2, projectChild)

export const projectInspectionRun: {
  (run: StoredRun): (state: RuntimeState) => Effect.Effect<Run, InspectionProjectionFailure>
  (state: RuntimeState, run: StoredRun): Effect.Effect<Run, InspectionProjectionFailure>
} = Function.dual(2, projectRun)

const projectSession = (
  state: RuntimeState,
  sessionId: string,
): Effect.Effect<Session, InspectionProjectionFailure> => {
  const stored = state.hostSessions.get(sessionId)
  if (stored === undefined || stored.session.id !== sessionId) {
    return Effect.fail(projectionFailure(`session:${sessionId}`))
  }
  const source = stored.session
  let priorCursor = -1
  for (const event of stored.events) {
    if (event.cursor <= priorCursor) {
      return Effect.fail(projectionFailure(`session:${sessionId}:events`, "ordering"))
    }
    priorCursor = event.cursor
  }
  if (priorCursor !== stored.lastCursor) {
    return Effect.fail(projectionFailure(`session:${sessionId}:lastCursor`, "ordering"))
  }
  if (source.activeRunId !== undefined && !state.runs.has(source.activeRunId)) {
    return Effect.fail(projectionFailure(`session:${sessionId}:activeRunId`))
  }
  const projected: Types.Mutable<Session> = {
    sessionId: source.id,
    createdAt: source.createdAt,
    lifecycle: source.lifecycle ?? "active",
    queuedInputs: source.queue.length,
    runCount: [...state.runs.values()].filter((run) => run.message.sessionId === sessionId).length,
  }
  if (source.title !== undefined) projected.title = source.title
  if (source.activeRunId !== undefined) projected.activeRunId = source.activeRunId
  return Effect.succeed(projected)
}

export const projectInspectionSession: {
  (sessionId: string): (state: RuntimeState) => Effect.Effect<Session, InspectionProjectionFailure>
  (state: RuntimeState, sessionId: string): Effect.Effect<Session, InspectionProjectionFailure>
} = Function.dual(2, projectSession)
