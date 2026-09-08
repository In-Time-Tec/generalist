import { Effect, Schema, type Types } from "effect"
import { SessionStoreError } from "../../../../core/context/session.js"
import { SessionNotFound, type HostSessionEvent } from "../../../session/host.js"
import {
  SessionHistoryInput,
  SessionPageInvalid,
  SessionRunsInput,
  type SessionRunSummary,
} from "../../../session/page.js"
import { RuntimeUnavailable } from "../../../errors.js"
import { emptySession, waitMapKey, type RuntimeState, type StoredRun } from "../../projection.js"
import { Request as ApprovalRequest } from "../../../operation/approval.js"
import { SessionReads } from "../../session-reader.js"
import { boundedEntry } from "./conversation.js"

export const runSummary = ({
  state,
  run,
}: {
  readonly state: RuntimeState
  readonly run: StoredRun
}): SessionRunSummary => {
  let turn = run.checkpoint !== undefined && "turn" in run.checkpoint ? run.checkpoint.turn : 0
  for (let index = run.events.length - 1; index >= Math.max(0, run.events.length - 256); index--) {
    const event = run.events[index]!
    if ("turn" in event) {
      turn = event.turn
      break
    }
  }
  const summary: Types.Mutable<SessionRunSummary> = {
    runId: run.runId,
    rootRunId: run.rootRunId,
    status: run.status,
    cursor: run.lastSequence,
    turn,
  }
  if (run.parentRunId !== undefined) summary.parentRunId = run.parentRunId
  if (run.suspension?._tag !== "generalist/core/AgentSuspended") return summary
  for (const suspended of run.suspension.waits.slice(0, 64)) {
    const wait = state.waits.get(waitMapKey(run.runId, suspended.waitId))
    if (wait?.status !== "open" || wait.reason._tag !== "Approval") continue
    const approval = wait.reason.request
    const encoded = Schema.encodeSync(Schema.fromJsonString(ApprovalRequest))(approval)
    if (new TextEncoder().encode(encoded).byteLength <= 8192) return { ...summary, approval }
  }
  return summary
}

export const recentRuns = ({
  state,
  events,
}: {
  readonly state: RuntimeState
  readonly events: ReadonlyArray<HostSessionEvent>
}) =>
  Effect.gen(function* () {
    const runs: Array<SessionRunSummary> = []
    const seen = new Set<string>()
    for (const item of events.slice(-256).toReversed()) {
      if (item._tag !== "Run" || seen.has(item.event.runId)) continue
      const run = state.runs.get(item.event.runId)
      if (run === undefined) return yield* RuntimeUnavailable.make({ message: "Session Run does not exist" })
      seen.add(run.runId)
      runs.unshift(runSummary({ state, run }))
      if (runs.length === 32) break
    }
    return runs
  })

export const sessionRun = ({
  state,
  sessionId,
  runId,
}: {
  readonly state: RuntimeState
  readonly sessionId: string
  readonly runId: string
}) =>
  Effect.gen(function* () {
    if (state.closed) return yield* RuntimeUnavailable.make({ message: "runtime store released" })
    if (!state.hostSessions.has(sessionId)) return yield* SessionNotFound.make({ sessionId })
    if (runId.length === 0 || runId.length > 1024) return yield* SessionPageInvalid.make({ sessionId })
    const run = state.runs.get(runId)
    if (run === undefined || state.runs.get(run.rootRunId)?.message.sessionId !== sessionId)
      return yield* SessionPageInvalid.make({ sessionId })
    return runSummary({ state, run })
  })

export const historyPage = ({
  state,
  sessionId,
  input,
}: {
  readonly state: RuntimeState
  readonly sessionId: string
  readonly input: SessionHistoryInput
}) =>
  Effect.gen(function* () {
    if (state.closed) return yield* RuntimeUnavailable.make({ message: "runtime store released" })
    if (!state.hostSessions.has(sessionId)) return yield* SessionNotFound.make({ sessionId })
    const invalid = () => SessionPageInvalid.make({ sessionId })
    if (!Schema.is(SessionHistoryInput)(input)) return yield* invalid()
    const session = state.sessions.get(sessionId) ?? emptySession()
    if (input.leafId !== null && !session.entries.has(input.leafId)) return yield* invalid()
    const page = SessionReads.pathPage(session, input)
    if (Schema.is(SessionStoreError)(page)) return yield* RuntimeUnavailable.make({ message: page.message })
    return {
      leafId: input.leafId,
      entries: page.entries.flatMap((entry) => {
        const projected = boundedEntry(entry)
        return projected === undefined ? [] : [projected]
      }),
      nextLeafId: page.nextCursor?.entryId ?? null,
    }
  })

const selectRuns = ({
  state,
  sessionId,
  input,
}: {
  readonly state: RuntimeState
  readonly sessionId: string
  readonly input: SessionRunsInput
}) =>
  Effect.gen(function* () {
    if (state.closed) return yield* RuntimeUnavailable.make({ message: "runtime store released" })
    const session = state.hostSessions.get(sessionId)
    if (session === undefined) return yield* SessionNotFound.make({ sessionId })
    const invalid = () => SessionPageInvalid.make({ sessionId })
    if (
      !Schema.is(SessionRunsInput)(input) ||
      input.at > session.lastCursor ||
      (input.before !== undefined && input.before > input.at + 1)
    )
      return yield* invalid()
    if (input.rootRunId !== undefined) {
      const root = state.runs.get(input.rootRunId)
      if (root === undefined || root.rootRunId !== root.runId || root.message.sessionId !== sessionId)
        return yield* invalid()
    }
    return session
  })

export const runsPage = ({
  state,
  sessionId,
  input,
}: {
  readonly state: RuntimeState
  readonly sessionId: string
  readonly input: SessionRunsInput
}) =>
  Effect.gen(function* () {
    const session = yield* selectRuns({ state, sessionId, input })
    const runs: Array<SessionRunSummary> = []
    let index = input.before === undefined ? input.at : input.before - 1
    let scanned = 0
    while (index >= 0 && scanned < 256 && runs.length < input.limit) {
      const item = session.events[index]
      if (item === undefined || item.cursor !== index)
        return yield* RuntimeUnavailable.make({ message: "Session event cursor does not match retained position" })
      index--
      scanned++
      if (item._tag !== "Run") continue
      const event = item.event
      if (event._tag !== "RunAccepted" && !(event._tag === "RunForked" && event.role !== "source")) continue
      const run = state.runs.get(event.runId)
      if (run === undefined) return yield* RuntimeUnavailable.make({ message: "Session Run does not exist" })
      if (input.rootRunId !== undefined && run.rootRunId !== input.rootRunId) continue
      runs.push(runSummary({ state, run }))
    }
    return { at: input.at, runs: runs.toReversed(), nextBefore: index < 0 ? null : index + 1 }
  })
