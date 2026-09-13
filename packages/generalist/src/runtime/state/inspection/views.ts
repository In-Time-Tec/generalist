import { Effect } from "effect"
import type { DurabilityFailure } from "../../../durability/errors.js"
import { RunNotFound, RuntimeUnavailable } from "../../errors.js"
import { ChildParentageInvalid } from "../../child/admission.js"
import type { Child, Run, RunStatus, Session } from "../../inspection.js"
import { SessionNotFound } from "../../session/host.js"
import type { RuntimeState, StoredRun } from "../projection.js"
import {
  projectInspectionChild,
  projectInspectionRun,
  projectInspectionSession,
  projectInspectionStatus,
} from "./projection.js"

type ReadError = DurabilityFailure | RuntimeUnavailable

export interface Service {
  readonly run: (runId: string) => Effect.Effect<Run, RunNotFound | ReadError>
  readonly child: (input: {
    readonly parentRunId: string
    readonly childRunId: string
  }) => Effect.Effect<Child, RunNotFound | ChildParentageInvalid | ReadError>
  readonly list: (input: {
    readonly status?: RunStatus
    readonly limit: number
  }) => Effect.Effect<ReadonlyArray<Run>, ReadError>
  readonly session: (sessionId: string) => Effect.Effect<Session, SessionNotFound | ReadError>
  readonly sessions: Effect.Effect<ReadonlyArray<Session>, ReadError>
}

export const make = (readState: Effect.Effect<RuntimeState, ReadError>): Service => {
  const session = (state: RuntimeState, sessionId: string) =>
    projectInspectionSession(state, sessionId).pipe(
      Effect.mapError(() => RuntimeUnavailable.make({ message: `Session ${sessionId} has no valid public view` })),
    )
  const run = (state: RuntimeState, stored: StoredRun) =>
    projectInspectionRun(state, stored).pipe(
      Effect.mapError(() => RuntimeUnavailable.make({ message: `Run ${stored.runId} has no valid public view` })),
    )
  return {
    child: (input) =>
      Effect.gen(function* () {
        const state = yield* readState
        const stored = state.runs.get(input.childRunId)
        if (stored === undefined) return yield* RunNotFound.make({ runId: input.childRunId })
        if (stored.parentRunId !== input.parentRunId) return yield* ChildParentageInvalid.make(input)
        return yield* projectInspectionChild(state, input.childRunId).pipe(
          Effect.mapError(() =>
            RuntimeUnavailable.make({ message: `Run ${input.childRunId} has no valid child view` }),
          ),
        )
      }),
    run: (runId) =>
      Effect.gen(function* () {
        const state = yield* readState
        const stored = state.runs.get(runId)
        if (stored === undefined) return yield* RunNotFound.make({ runId })
        return yield* run(state, stored)
      }),
    list: (input) =>
      Effect.gen(function* () {
        if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 200) {
          return yield* RuntimeUnavailable.make({ message: "Runtime inspection limit must be between 1 and 200" })
        }
        const state = yield* readState
        const selected = [...state.runs.values()]
          .toReversed()
          .filter((stored) => input.status === undefined || projectInspectionStatus(stored.status) === input.status)
          .slice(0, input.limit)
        return yield* Effect.forEach(selected, (stored) => run(state, stored), { concurrency: 8 })
      }),
    session: (sessionId) =>
      Effect.gen(function* () {
        const state = yield* readState
        if (!state.hostSessions.has(sessionId)) return yield* SessionNotFound.make({ sessionId })
        return yield* session(state, sessionId)
      }),
    sessions: readState.pipe(
      Effect.flatMap((state) =>
        Effect.forEach([...state.hostSessions.keys()], (sessionId) => session(state, sessionId), { concurrency: 8 }),
      ),
    ),
  }
}
