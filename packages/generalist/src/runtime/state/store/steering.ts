import type { PreparedObservation } from "../observation.js"
import { Effect, Function, Option } from "effect"
import { InboxFull, defaultCapacity, defaultMaxPendingBytes, promptBytes } from "../../../core/turn/steering.js"
import { RunBusy, RunNotFound, RunTerminal, RuntimeUnavailable, SteeringConflict } from "../../errors.js"
import type { AdmitSteeringInput, ExecutionClaim, SteeringAdmission } from "../../run/store.js"
import { appendLifecycle, rejectIfTerminal } from "../append.js"
import type { RuntimeState, StoredRun } from "../projection.js"
import { requireAgentOrProgram } from "../../executable/manifest-internal.js"
import { reconcileRunWaits } from "./control/run-wait.js"

const requireRun = (state: RuntimeState, runId: string): Effect.Effect<StoredRun, RunNotFound | RuntimeUnavailable> => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(runId)
  return run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run)
}

export const admitSteering: {
  (
    input: AdmitSteeringInput,
  ): (
    state: RuntimeState,
  ) => Effect.Effect<
    readonly [SteeringAdmission, RuntimeState],
    | RunNotFound
    | RunTerminal
    | RunBusy
    | RuntimeUnavailable
    | SteeringConflict
    | InboxFull
    | import("../../errors.js").RunKindUnsupported,
    PreparedObservation
  >
  (
    state: RuntimeState,
    input: AdmitSteeringInput,
  ): Effect.Effect<
    readonly [SteeringAdmission, RuntimeState],
    | RunNotFound
    | RunTerminal
    | RunBusy
    | RuntimeUnavailable
    | SteeringConflict
    | InboxFull
    | import("../../errors.js").RunKindUnsupported,
    PreparedObservation
  >
} = Function.dual(2, (state: RuntimeState, input: AdmitSteeringInput) =>
  Effect.gen(function* () {
    const run = yield* requireRun(state, input.runId)
    yield* requireAgentOrProgram({ ...run, operation: "steer" })
    const prior = run.steering.find((entry) => entry.idempotencyKey === input.idempotencyKey)
    if (prior !== undefined) {
      if (prior.digest === input.digest) {
        return [{ receipt: { entryId: prior.entryId, sequence: prior.sequence }, duplicate: true }, state] as const
      }
      return yield* SteeringConflict.make({ runId: input.runId, idempotencyKey: input.idempotencyKey })
    }
    if (input.policy === "reject" && run.ownerId !== undefined) return yield* RunBusy.make({ runId: run.runId })
    const terminal = rejectIfTerminal(run)
    if (Option.isSome(terminal) || run.pendingOutcome !== undefined) {
      const status = Option.getOrElse(terminal, () =>
        run.pendingOutcome?._tag === "Completed" ? "succeeded" : "failed",
      )
      return yield* RunTerminal.make({ runId: run.runId, status })
    }
    const pending = run.steering.filter(
      (entry) => entry.consumedOperationId === undefined && entry.discardedReason === undefined,
    )
    if (pending.length >= defaultCapacity) {
      return yield* InboxFull.make({
        runId: run.runId,
        queue: "steering",
        dimension: "entries",
        limit: defaultCapacity,
      })
    }
    const pendingBytes = pending.reduce((total, entry) => total + promptBytes(entry.prompt), 0)
    if (pendingBytes + promptBytes(input.prompt) > defaultMaxPendingBytes) {
      return yield* InboxFull.make({
        runId: run.runId,
        queue: "steering",
        dimension: "bytes",
        limit: defaultMaxPendingBytes,
      })
    }
    const entry = {
      entryId: `steer_${state.nextSteeringCounter}`,
      runId: run.runId,
      sequence: run.steering.length,
      idempotencyKey: input.idempotencyKey,
      digest: input.digest,
      prompt: input.prompt,
      policy: input.policy,
      from: input.from,
      ...(input.sessionCommandId === undefined ? undefined : { sessionCommandId: input.sessionCommandId }),
      ...(input.addressed === undefined ? undefined : { addressed: input.addressed }),
    }
    const runs = new Map(state.runs)
    runs.set(run.runId, {
      ...run,
      steering: [...run.steering, entry],
    })
    const [, accepted] = yield* appendLifecycle(
      { ...state, nextSteeringCounter: state.nextSteeringCounter + 1, runs },
      run.runId,
      {
        _tag: "Inbox",
        entryId: entry.entryId,
        inboxSequence: entry.sequence,
        idempotencyKey: entry.idempotencyKey,
        digest: entry.digest,
        message: entry.prompt,
        policy: entry.policy,
        from: entry.from,
        ...(entry.sessionCommandId === undefined ? undefined : { sessionCommandId: entry.sessionCommandId }),
        ...(entry.addressed === undefined ? undefined : { addressed: entry.addressed }),
      },
    )
    return [
      { receipt: { entryId: entry.entryId, sequence: entry.sequence }, duplicate: false },
      yield* reconcileRunWaits(accepted, run.runId),
    ] as const
  }),
)

type SteeringRead = Pick<ExecutionClaim, "runId">

export const readSteering: {
  (
    input: SteeringRead,
  ): (
    state: RuntimeState,
  ) => Effect.Effect<
    (import("../../run/steering.js").SteeringEntry & { readonly consumedOperationId?: string })[],
    RunNotFound | RuntimeUnavailable,
    never
  >
  (
    state: RuntimeState,
    input: SteeringRead,
  ): Effect.Effect<
    (import("../../run/steering.js").SteeringEntry & { readonly consumedOperationId?: string })[],
    RunNotFound | RuntimeUnavailable,
    never
  >
} = Function.dual(2, (state: RuntimeState, input: SteeringRead) =>
  Effect.map(requireRun(state, input.runId), (run) =>
    run.steering.filter((entry) => entry.consumedOperationId === undefined && entry.discardedReason === undefined),
  ),
)
