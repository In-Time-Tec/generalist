import { expect } from "@effect/vitest"
import { Clock, Effect, Option } from "effect"
import { Pins, ProgramCapabilities } from "@batonfx/core"
import { Errors, ExecutionHost, RunClaims, Runtime, RunStore } from "../src/index.js"
import type { ExecutionClaim, WorkerMutationError } from "../src/run-store.js"
import type { ProgramStoreFailure } from "../src/program-store.js"
import { program, programAddress } from "./program-fixture.js"

const reserve = (
  store: RunStore.Interface,
  execution: ExecutionClaim,
  operation: string,
  budget: typeof program.pinned.manifest.budget,
  reservation: {
    readonly toolCalls?: number
    readonly agentRuns?: number
    readonly logBytes?: number
    readonly activeSlots?: number
  },
  nowMillis: number,
  input: unknown = operation,
) =>
  store.reserveProgramOperation({
    ...execution,
    programPin: program.pinned.pin,
    budget,
    nowMillis,
    operation,
    kind: "tool",
    capability: "echo",
    inputDigest: Pins.digest(input),
    input,
    replay: "recorded",
    reservation,
  })

const claimExistingProgram = (runId: string, label: string) =>
  Effect.gen(function* () {
    const store = yield* RunStore.RunStore
    const claims = yield* Effect.serviceOption(RunClaims.RunClaims)
    if (Option.isNone(claims)) {
      return yield* store.claimExecution({ runId, ownerId: `program-contract-${label}` })
    }
    const [claim] = yield* claims.value.claimReadyRuns({ workerId: `program-contract-${label}`, limit: 1 })
    if (claim?.run.runId !== runId) return yield* Effect.die(`Program Run ${runId} was not claimable`)
    return { runId, ownerId: claim.workerId, attemptFence: claim.attemptFence }
  })

const claimProgram = (label: string) =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const receipt = yield* runtime.send({
      to: programAddress,
      sessionId: `program-contract-${label}`,
      idempotencyKey: `program-contract-${label}`,
      prompt: "run",
    })
    return yield* claimExistingProgram(receipt.runId, label)
  })

type ProgramContractServices = Runtime.Runtime | RunStore.RunStore

type ProgramContractError = Runtime.SendError | WorkerMutationError | ProgramStoreFailure

export const programBudgetContract: Effect.Effect<void, ProgramContractError, ProgramContractServices> = Effect.gen(function* () {
  const store = yield* RunStore.RunStore
  let run = 0
  const claim = (dimension: string) => claimProgram(`${dimension}-${++run}`)
  const expectReservationFailure = (dimension: "toolCalls" | "agentRuns" | "logBytes" | "concurrency") =>
    Effect.gen(function* () {
      const execution = yield* claim(dimension)
      const budget = { ...program.pinned.manifest.budget, ...(dimension === "concurrency" ? {} : { [dimension]: 0 }) }
      const reservation =
        dimension === "toolCalls"
          ? { toolCalls: 1 }
          : dimension === "agentRuns"
            ? { agentRuns: 1 }
            : dimension === "logBytes"
              ? { logBytes: 1 }
              : { activeSlots: budget.concurrency + 1 }
      expect(
        yield* reserve(store, execution, dimension, budget, reservation, yield* Clock.currentTimeMillis).pipe(
          Effect.flip, Effect.orDie,
        ),
      ).toMatchObject({ dimension, limit: dimension === "concurrency" ? budget.concurrency : 0 })
    })

  yield* Effect.forEach(["toolCalls", "agentRuns", "logBytes", "concurrency"] as const, expectReservationFailure, {
    discard: true,
  })

  const tokenClaim = yield* claim("tokens")
  yield* reserve(
    store,
    tokenClaim,
    "tokens",
    { ...program.pinned.manifest.budget, tokens: 0 },
    {},
    yield* Clock.currentTimeMillis,
  )
  expect(
    yield* store.settleProgramOperation({
      ...tokenClaim,
      operation: "tokens",
      outcome: { _tag: "Succeeded", value: "result", tokens: 1 },
      releaseSlots: 0,
    }),
  ).toMatchObject({ status: "failed", error: { dimension: "tokens", limit: 0 } })

  const wallClaim = yield* claim("wallClockMillis")
  const startedAt = yield* Clock.currentTimeMillis
  const wallBudget = { ...program.pinned.manifest.budget, wallClockMillis: 0 }
  yield* reserve(store, wallClaim, "wall-start", wallBudget, {}, startedAt)
  expect(
    yield* reserve(store, wallClaim, "wall-expired", wallBudget, {}, startedAt + 1).pipe(Effect.flip, Effect.orDie),
  ).toMatchObject({ dimension: "wallClockMillis", limit: 0 })

  const outputClaim = yield* claim("outputBytes")
  expect(
    yield* store.completeProgram({ ...outputClaim, output: "x", outputBytes: 1, outputLimit: 0 }).pipe(Effect.flip, Effect.orDie),
  ).toMatchObject({ dimension: "outputBytes", limit: 0 })
})

export const programReplayDivergenceContract: Effect.Effect<void, ProgramContractError, ProgramContractServices> = Effect.gen(
  function* () {
    const store = yield* RunStore.RunStore
    const execution = yield* claimProgram("replay-divergence")
    const nowMillis = yield* Clock.currentTimeMillis
    yield* reserve(store, execution, "same-operation", program.pinned.manifest.budget, { toolCalls: 1 }, nowMillis, {
      value: "first",
    })
    const divergence = yield* reserve(
      store,
      execution,
      "same-operation",
      program.pinned.manifest.budget,
      { toolCalls: 1 },
      nowMillis,
      { value: "changed" },
    ).pipe(Effect.flip, Effect.orDie)
    expect(divergence).toMatchObject({ _tag: "@batonfx/core/ProgramReplayDivergence", operation: "same-operation" })
    expect(yield* store.loadProgramState(execution.runId)).toMatchObject({ toolCalls: 1 })
    expect(yield* store.getProgramOperation({ runId: execution.runId, operation: "same-operation" })).toMatchObject({
      input: { value: "first" },
      status: "reserved",
    })
  },
)

export const programCancellationFenceContract: Effect.Effect<void, ProgramContractError, ProgramContractServices> = Effect.gen(
  function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore.RunStore
    const execution = yield* claimProgram("cancel-fence")
    yield* reserve(
      store,
      execution,
      "cancelled-operation",
      program.pinned.manifest.budget,
      { toolCalls: 1, activeSlots: 1 },
      yield* Clock.currentTimeMillis,
    )
    yield* store.startProgramOperation({ ...execution, operation: "cancelled-operation" })
    yield* runtime.cancel({ runId: execution.runId, reason: "cancel active Program operation" })

    const staleCommit = yield* store
      .settleProgramOperation({
        ...execution,
        operation: "cancelled-operation",
        outcome: { _tag: "Succeeded", value: "stale value" },
        releaseSlots: 1,
      })
      .pipe(Effect.flip, Effect.orDie)
    expect(staleCommit).toBeInstanceOf(Errors.StaleClaim)
    expect(
      yield* store.getProgramOperation({ runId: execution.runId, operation: "cancelled-operation" }),
    ).toMatchObject({
      status: "failed",
    })
    expect((yield* store.loadProgramState(execution.runId))?.activeSlots).toBe(0)
  },
)

export const programSettledReplayContract: Effect.Effect<void, ProgramContractError, ProgramContractServices> = Effect.gen(
  function* () {
    const store = yield* RunStore.RunStore
    const success = yield* claimProgram("settled-replay-success")
    yield* reserve(
      store,
      success,
      "replayed-success",
      program.pinned.manifest.budget,
      { toolCalls: 1, activeSlots: 1 },
      yield* Clock.currentTimeMillis,
    )
    yield* store.startProgramOperation({ ...success, operation: "replayed-success" })
    const successOutcome = { _tag: "Succeeded" as const, value: { value: "result" } }
    expect(
      yield* store.settleProgramOperation({
        ...success,
        operation: "replayed-success",
        outcome: successOutcome,
        releaseSlots: 1,
      }),
    ).toMatchObject({ status: "succeeded", result: { value: "result" } })
    expect(
      yield* store.settleProgramOperation({
        ...success,
        operation: "replayed-success",
        outcome: successOutcome,
        releaseSlots: 1,
      }),
    ).toMatchObject({ status: "succeeded", result: { value: "result" } })
    expect((yield* store.loadProgramState(success.runId))?.activeSlots).toBe(0)
    const divergentSuccess = yield* store
      .settleProgramOperation({
        ...success,
        operation: "replayed-success",
        outcome: { _tag: "Succeeded", value: { value: "changed" } },
        releaseSlots: 1,
      })
      .pipe(Effect.flip, Effect.orDie)
    expect(divergentSuccess).toBeInstanceOf(Errors.StaleClaim)

    const failure = yield* claimProgram("settled-replay-failure")
    yield* reserve(
      store,
      failure,
      "replayed-failure",
      program.pinned.manifest.budget,
      { toolCalls: 1, activeSlots: 1 },
      yield* Clock.currentTimeMillis,
    )
    yield* store.startProgramOperation({ ...failure, operation: "replayed-failure" })
    const failureOutcome = { _tag: "Failed" as const, error: { _tag: "test", message: "boom" } }
    expect(
      yield* store.settleProgramOperation({
        ...failure,
        operation: "replayed-failure",
        outcome: failureOutcome,
        releaseSlots: 1,
      }),
    ).toMatchObject({ status: "failed", error: { _tag: "test", message: "boom" } })
    expect(
      yield* store.settleProgramOperation({
        ...failure,
        operation: "replayed-failure",
        outcome: failureOutcome,
        releaseSlots: 1,
      }),
    ).toMatchObject({ status: "failed", error: { _tag: "test", message: "boom" } })
    const divergentFailure = yield* store
      .settleProgramOperation({
        ...failure,
        operation: "replayed-failure",
        outcome: { _tag: "Failed", error: { _tag: "test", message: "changed" } },
        releaseSlots: 1,
      })
      .pipe(Effect.flip, Effect.orDie)
    expect(divergentFailure).toBeInstanceOf(Errors.StaleClaim)

    const unknown = yield* claimProgram("settled-replay-unknown")
    yield* reserve(
      store,
      unknown,
      "replayed-unknown",
      program.pinned.manifest.budget,
      { toolCalls: 1, activeSlots: 1 },
      yield* Clock.currentTimeMillis,
    )
    yield* store.startProgramOperation({ ...unknown, operation: "replayed-unknown" })
    expect(
      yield* store.settleProgramOperation({
        ...unknown,
        operation: "replayed-unknown",
        outcome: { _tag: "Unknown" },
        releaseSlots: 1,
      }),
    ).toMatchObject({ status: "unknown" })
    expect(
      yield* store.settleProgramOperation({
        ...unknown,
        operation: "replayed-unknown",
        outcome: { _tag: "Unknown" },
        releaseSlots: 1,
      }),
    ).toMatchObject({ status: "unknown" })
    const divergentUnknown = yield* store
      .settleProgramOperation({
        ...unknown,
        operation: "replayed-unknown",
        outcome: { _tag: "Succeeded", value: "late" },
        releaseSlots: 1,
      })
      .pipe(Effect.flip, Effect.orDie)
    expect(divergentUnknown).toBeInstanceOf(Errors.StaleClaim)
  },
)

export const programCancellationFinalizerContract: Effect.Effect<void, ProgramContractError, ProgramContractServices> = Effect.gen(
  function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore.RunStore
    const execution = yield* claimProgram("cancel-finalizer")
    const reason = "cancel finalizer settlement"
    yield* reserve(
      store,
      execution,
      "finalized-operation",
      program.pinned.manifest.budget,
      { toolCalls: 1, activeSlots: 1 },
      yield* Clock.currentTimeMillis,
    )
    yield* store.startProgramOperation({ ...execution, operation: "finalized-operation" })
    yield* runtime.cancel({ runId: execution.runId, reason })
    const settled = yield* store.settleProgramOperation({
      ...execution,
      operation: "finalized-operation",
      outcome: { _tag: "Failed", error: ProgramCapabilities.ProgramCancelled.make({ reason }) },
      releaseSlots: 1,
    })
    expect(settled).toMatchObject({
      status: "failed",
      error: { _tag: "@batonfx/core/ProgramCancelled", reason },
    })
    expect(
      yield* store.getProgramOperation({ runId: execution.runId, operation: "finalized-operation" }),
    ).toMatchObject({
      status: "failed",
    })
    expect((yield* store.loadProgramState(execution.runId))?.activeSlots).toBe(0)
  },
)

export const programUnknownOutcomeContract = (
  resolutionIdempotencyKey: string,
): Effect.Effect<void, ProgramContractError | Errors.OperationResolutionConflict, ProgramContractServices | ExecutionHost.ExecutionHost> =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore.RunStore
    const host = yield* ExecutionHost.ExecutionHost
    const execution = yield* claimProgram("unknown-outcome")
    const request = { operation: "echo", tool: "echo", input: "value" }
    yield* store.reserveProgramOperation({
      ...execution,
      programPin: program.pinned.pin,
      budget: program.pinned.manifest.budget,
      nowMillis: yield* Clock.currentTimeMillis,
      operation: "echo",
      kind: "tool",
      capability: "echo",
      inputDigest: Pins.digest({ kind: "tool", capability: "echo", input: request }),
      input: request,
      replay: "non-idempotent",
      reservation: { toolCalls: 1, activeSlots: 1 },
    })
    yield* store.startProgramOperation({ ...execution, operation: "echo" })
    yield* host.execute(execution)
    expect((yield* runtime.inspect(execution.runId)).status).toBe("needs-resolution")
    expect(yield* store.getProgramOperation({ runId: execution.runId, operation: "echo" })).toMatchObject({
      status: "unknown",
    })
    yield* runtime.resolveOperation({
      runId: execution.runId,
      operationId: "echo",
      idempotencyKey: resolutionIdempotencyKey,
      resolution: { _tag: "Succeeded", value: "recovered" },
    })
    const recovery = yield* claimExistingProgram(execution.runId, "recovery")
    yield* host.execute(recovery)
    expect((yield* runtime.snapshot(execution.runId)).outcome).toMatchObject({
      _tag: "Succeeded",
      result: { _tag: "Program", value: "recovered|recovered" },
    })
  })
