import { Effect, Function, Option } from "effect"
import { RunNotFound, RunTerminal, RuntimeUnavailable, SteeringConflict } from "../../errors.js"
import type { AdmitSteeringInput, ExecutionClaim } from "../../run/store.js"
import type { SteeringReceipt } from "../../run/steering.js"
import { appendLifecycle, rejectIfTerminal } from "../append.js"
import type { MemoryState, StoredRun } from "../state.js"

const requireRun = (state: MemoryState, runId: string): Effect.Effect<StoredRun, RunNotFound | RuntimeUnavailable> => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(runId)
  return run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run)
}

export const admitSteering: {
  (
    input: AdmitSteeringInput,
  ): (
    state: MemoryState,
  ) => Effect.Effect<
    readonly [SteeringReceipt, MemoryState],
    RunNotFound | RunTerminal | RuntimeUnavailable | SteeringConflict,
    never
  >
  (
    state: MemoryState,
    input: AdmitSteeringInput,
  ): Effect.Effect<
    readonly [SteeringReceipt, MemoryState],
    RunNotFound | RunTerminal | RuntimeUnavailable | SteeringConflict,
    never
  >
} = Function.dual(2, (state: MemoryState, input: AdmitSteeringInput) =>
  Effect.gen(function* () {
    const run = yield* requireRun(state, input.runId)
    const prior = run.steering.find((entry) => entry.idempotencyKey === input.idempotencyKey)
    if (prior !== undefined) {
      if (prior.digest === input.digest) return [{ entryId: prior.entryId, sequence: prior.sequence }, state] as const
      return yield* SteeringConflict.make({ runId: input.runId, idempotencyKey: input.idempotencyKey })
    }
    const terminal = rejectIfTerminal(run)
    if (Option.isSome(terminal) || run.pendingOutcome !== undefined) {
      const status = Option.getOrElse(terminal, () =>
        run.pendingOutcome?._tag === "Completed" ? "succeeded" : "failed",
      )
      return yield* RunTerminal.make({ runId: run.runId, status })
    }
    const entry = {
      entryId: `steer_${state.nextSteeringCounter}`,
      runId: run.runId,
      sequence: run.steering.length,
      idempotencyKey: input.idempotencyKey,
      digest: input.digest,
      prompt: input.prompt,
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
        _tag: "SteeringAccepted",
        entryId: entry.entryId,
        steeringSequence: entry.sequence,
        idempotencyKey: entry.idempotencyKey,
        digest: entry.digest,
        prompt: entry.prompt,
      },
    )
    return [{ entryId: entry.entryId, sequence: entry.sequence }, accepted] as const
  }),
)

export const readSteering: {
  (
    input: ExecutionClaim,
  ): (
    state: MemoryState,
  ) => Effect.Effect<
    (import("../../run/steering.js").SteeringEntry & { readonly consumedOperationId?: string })[],
    RunNotFound | RuntimeUnavailable,
    never
  >
  (
    state: MemoryState,
    input: ExecutionClaim,
  ): Effect.Effect<
    (import("../../run/steering.js").SteeringEntry & { readonly consumedOperationId?: string })[],
    RunNotFound | RuntimeUnavailable,
    never
  >
} = Function.dual(2, (state: MemoryState, input: ExecutionClaim) =>
  Effect.map(requireRun(state, input.runId), (run) =>
    run.steering.filter((entry) => entry.consumedOperationId === undefined && entry.discardedReason === undefined),
  ),
)
