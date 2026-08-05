import { describe, expect, it } from "@effect/vitest"
import { Clock, Effect, Redacted } from "effect"
import { Pins } from "@batonfx/core"
import { PgClient } from "@effect/sql-pg"
import { SqlClient } from "effect/unstable/sql"
import { Errors, ExecutionHost, RunClaims, Runtime, RunStore } from "../../src/index.js"
import {
  agentMapProgramFixture,
  approvalProgramFixture,
  program,
  programAddress,
  programExecutable,
  programFixture,
} from "../program-fixture.js"
import { postgresAvailable, postgresUrl, preparePostgres } from "./helpers.js"
import { registrationsFor } from "../helpers.js"
import {
  programBudgetContract,
  programCancellationFenceContract,
  programCancellationFinalizerContract,
  programReplayDivergenceContract,
  programSettledReplayContract,
} from "../program-store-contract.js"

const describePostgres = postgresAvailable ? describe.sequential : describe.skip

describePostgres("postgres Program store contract", () => {
  it.live("enforces budgets, replay identity, and cancellation fences", () => {
    const url = postgresUrl!
    const fixture = programFixture()
    const options = {
      url,
      resolver: fixture.resolver,
      addresses: [
        { address: programAddress, executable: programExecutable, registrations: registrationsFor(programExecutable) },
      ],
    }
    return programBudgetContract.pipe(
      Effect.andThen(programReplayDivergenceContract),
      Effect.andThen(programSettledReplayContract),
      Effect.andThen(programCancellationFinalizerContract),
      Effect.andThen(programCancellationFenceContract),
      Effect.provide(Runtime.layerPostgres(options)),
      Effect.scoped,
      (execute) => preparePostgres(url).pipe(Effect.andThen(execute)),
    )
  })

  it.live("atomically records and replays Program tool and log operations", () => {
    const url = postgresUrl!
    const fixture = programFixture()
    return Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const claims = yield* RunClaims.RunClaims
      const host = yield* ExecutionHost.ExecutionHost
      const receipt = yield* runtime.send({
        to: programAddress,
        sessionId: "postgres-program",
        idempotencyKey: "postgres-program",
        prompt: "run",
      })
      const [claim] = yield* claims.claimReadyRuns({ workerId: "postgres-program", limit: 1 })
      yield* host.execute({ runId: receipt.runId, ownerId: claim!.workerId, attemptFence: claim!.attemptFence })
      const runId = receipt.runId
      expect((yield* runtime.inspect(runId)).status).toBe("succeeded")
      expect(yield* store.getProgramOperation({ runId, operation: "echo" })).toMatchObject({ status: "succeeded" })
      expect(yield* store.getProgramOperation({ runId, operation: "summary" })).toMatchObject({
        status: "succeeded",
      })
      expect(fixture.counts()).toEqual({ toolCalls: 1, logs: 1 })
    }).pipe(
      Effect.provide(
        Runtime.layerPostgres({
          url,
          resolver: fixture.resolver,
          addresses: [
            {
              address: programAddress,
              executable: programExecutable,
              registrations: registrationsFor(programExecutable),
            },
          ],
        }),
      ),
      Effect.scoped,
      (execute) => preparePostgres(url).pipe(Effect.andThen(execute)),
    )
  })

  it.live("atomically reserves one approval response and resumes the Program operation", () => {
    const url = postgresUrl!
    const fixture = approvalProgramFixture()
    let runId = ""
    const options = {
      url,
      resolver: fixture.resolver,
      addresses: [
        { address: programAddress, executable: programExecutable, registrations: registrationsFor(programExecutable) },
      ],
    }
    const suspend = Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const claims = yield* RunClaims.RunClaims
      const host = yield* ExecutionHost.ExecutionHost
      const receipt = yield* runtime.send({
        to: programAddress,
        sessionId: "postgres-program-approval",
        idempotencyKey: "postgres-program-approval",
        prompt: "run",
      })
      runId = receipt.runId
      const [first] = yield* claims.claimReadyRuns({ workerId: "postgres-program", limit: 1 })
      yield* host.execute({ runId: receipt.runId, ownerId: first!.workerId, attemptFence: first!.attemptFence })
      yield* Effect.all(
        [
          runtime.respond({
            runId: receipt.runId,
            waitId: "approval:echo",
            resolution: { _tag: "Approved" },
          }),
          runtime.respond({
            runId: receipt.runId,
            waitId: "approval:echo",
            resolution: { _tag: "Approved" },
          }),
        ],
        { concurrency: "unbounded" },
      )
      expect(yield* store.getProgramOperation({ runId: receipt.runId, operation: "echo" })).toMatchObject({
        status: "reserved",
      })
    }).pipe(Effect.provide(Runtime.layerPostgres(options)), Effect.scoped)
    const resume = Effect.suspend(() =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const claims = yield* RunClaims.RunClaims
        const host = yield* ExecutionHost.ExecutionHost
        const receipt = { runId }
        const [resumed] = yield* claims.claimReadyRuns({ workerId: "postgres-program", limit: 1 })
        expect(yield* store.loadExecution(receipt.runId)).toMatchObject({
          suspension: { operation: "echo", reason: "approval" },
          resolution: { _tag: "Approved" },
        })
        yield* host.execute({ runId: receipt.runId, ownerId: resumed!.workerId, attemptFence: resumed!.attemptFence })
        expect(fixture.counts()).toEqual({ authorizations: 1, executions: 1, sandboxes: 2 })
        expect(yield* store.getProgramOperation({ runId: receipt.runId, operation: "echo" })).toMatchObject({
          status: "succeeded",
        })
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("succeeded")
      }).pipe(Effect.provide(Runtime.layerPostgres(options)), Effect.scoped),
    )
    return preparePostgres(url).pipe(Effect.andThen(suspend), Effect.andThen(resume))
  })

  it.live("does not reopen a cancelled Program approval operation", () => {
    const url = postgresUrl!
    const fixture = approvalProgramFixture()
    const options = {
      url,
      resolver: fixture.resolver,
      addresses: [
        { address: programAddress, executable: programExecutable, registrations: registrationsFor(programExecutable) },
      ],
    }
    return Effect.gen(function* () {
      yield* preparePostgres(url)
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const claims = yield* RunClaims.RunClaims
      const host = yield* ExecutionHost.ExecutionHost
      const receipt = yield* runtime.send({
        to: programAddress,
        sessionId: "postgres-program-cancelled-approval",
        idempotencyKey: "postgres-program-cancelled-approval",
        prompt: "run",
      })
      const [claim] = yield* claims.claimReadyRuns({ workerId: "postgres-program-cancelled-approval", limit: 1 })
      yield* host.execute({ runId: receipt.runId, ownerId: claim!.workerId, attemptFence: claim!.attemptFence })
      const operation = yield* store.getProgramOperation({ runId: receipt.runId, operation: "echo" })
      if (operation?.waitId === undefined) return yield* Effect.die("Program approval wait is missing")
      yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql`
          UPDATE baton_runs SET status = 'running', owner_worker_id = 'postgres-program-cancelled-approval'
          WHERE run_id = ${receipt.runId}
        `
      }).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url) })), Effect.scoped)
      yield* runtime.cancel({ runId: receipt.runId, reason: "stop" })
      const response = yield* runtime
        .respond({ runId: receipt.runId, waitId: operation.waitId, resolution: { _tag: "Approved" } })
        .pipe(Effect.flip)
      expect(response).toBeInstanceOf(Errors.WaitNotOpen)
      yield* runtime.signal({ runId: receipt.runId, name: operation.waitId })
      const resume = yield* store
        .resume({ runId: receipt.runId, waitId: operation.waitId, resolution: { _tag: "Approved" } })
        .pipe(Effect.flip)
      expect(resume).toBeInstanceOf(Errors.WaitNotOpen)
      expect(yield* store.getProgramOperation({ runId: receipt.runId, operation: "echo" })).toMatchObject({
        status: "failed",
      })
      expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelling")
    }).pipe(Effect.provide(Runtime.layerPostgres(options)), Effect.scoped)
  })

  it.live("claims Program children in order, wakes the parent, and settles cancellation", () => {
    const url = postgresUrl!
    const fixture = agentMapProgramFixture()
    return Effect.gen(function* () {
      yield* preparePostgres(url)
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const claims = yield* RunClaims.RunClaims
      const host = yield* ExecutionHost.ExecutionHost
      const receipt = yield* runtime.send({
        to: fixture.address,
        sessionId: "postgres-program-map",
        idempotencyKey: "postgres-program-map",
        prompt: "run",
      })
      const [parentAdmission] = yield* claims.claimReadyRuns({ workerId: "postgres-program", limit: 1 })
      yield* host.execute({
        runId: receipt.runId,
        ownerId: parentAdmission!.workerId,
        attemptFence: parentAdmission!.attemptFence,
      })
      const admitted = yield* store.getProgramOperation({ runId: receipt.runId, operation: "workers" })
      expect(admitted).toMatchObject({ status: "waiting" })
      const firstChildren = yield* claims.claimReadyRuns({ workerId: "postgres-program", limit: 2 })
      expect(firstChildren).toHaveLength(2)
      yield* Effect.forEach(
        firstChildren,
        (claim) => host.execute({ runId: claim.run.runId, ownerId: claim.workerId, attemptFence: claim.attemptFence }),
        { concurrency: "unbounded", discard: true },
      )
      const [thirdChild] = yield* claims.claimReadyRuns({ workerId: "postgres-program", limit: 1 })
      yield* host.execute({
        runId: thirdChild!.run.runId,
        ownerId: thirdChild!.workerId,
        attemptFence: thirdChild!.attemptFence,
      })
      expect(fixture.counts().childFinalizers).toBe(3)
      const [resumedParent] = yield* claims.claimReadyRuns({ workerId: "postgres-program", limit: 1 })
      expect(resumedParent!.run.runId).toBe(receipt.runId)
      yield* host.execute({
        runId: receipt.runId,
        ownerId: resumedParent!.workerId,
        attemptFence: resumedParent!.attemptFence,
      })
      expect((yield* runtime.snapshot(receipt.runId)).outcome).toMatchObject({
        _tag: "Succeeded",
        result: { _tag: "Program", value: ["third:child", "first:child", "second:child"] },
      })

      const cancelled = yield* runtime.send({
        to: fixture.address,
        sessionId: "postgres-program-map-cancel",
        idempotencyKey: "postgres-program-map-cancel",
        prompt: "run",
      })
      const [cancelAdmission] = yield* claims.claimReadyRuns({ workerId: "postgres-program", limit: 1 })
      yield* host.execute({
        runId: cancelled.runId,
        ownerId: cancelAdmission!.workerId,
        attemptFence: cancelAdmission!.attemptFence,
      })
      const cancelledOperation = yield* store.getProgramOperation({ runId: cancelled.runId, operation: "workers" })
      yield* runtime.cancel({ runId: cancelled.runId, reason: "cancel admitted Program tree" })
      expect((yield* runtime.inspect(cancelled.runId)).status).toBe("cancelled")
      for (const childRunId of cancelledOperation?.childRunIds ?? []) {
        expect((yield* runtime.inspect(childRunId)).status).toBe("cancelled")
      }
      const waitId = cancelledOperation?.waitId
      if (waitId === undefined) return yield* Effect.die("cancelled Program operation wait is missing")
      const response = yield* runtime
        .respond({ runId: cancelled.runId, waitId, resolution: { _tag: "Approved" } })
        .pipe(Effect.flip)
      expect(response._tag).toBe("@batonfx/runtime/RunTerminal")
      const signal = yield* runtime.signal({ runId: cancelled.runId, name: waitId }).pipe(Effect.flip)
      expect(signal._tag).toBe("@batonfx/runtime/RunTerminal")
      const resume = yield* store
        .resume({ runId: cancelled.runId, waitId, resolution: { _tag: "Approved" } })
        .pipe(Effect.flip)
      expect(resume._tag).toBe("@batonfx/runtime/RunTerminal")
      expect(yield* store.getProgramOperation({ runId: cancelled.runId, operation: "workers" })).toMatchObject({
        status: "failed",
      })
      expect((yield* store.loadProgramState(cancelled.runId))?.activeSlots).toBe(0)
    }).pipe(
      Effect.provide(
        Runtime.layerPostgres({
          url,
          resolver: fixture.resolver,
          addresses: [
            {
              address: fixture.address,
              executable: fixture.executable,
              registrations: registrationsFor(fixture.executable),
            },
          ],
        }),
      ),
      Effect.scoped,
    )
  })

  it.live("resolves a crashed non-idempotent Program operation without redispatch", () => {
    const url = postgresUrl!
    const fixture = programFixture()
    return Effect.gen(function* () {
      yield* preparePostgres(url)
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const claims = yield* RunClaims.RunClaims
      const host = yield* ExecutionHost.ExecutionHost
      const receipt = yield* runtime.send({
        to: programAddress,
        sessionId: "postgres-program-unknown",
        idempotencyKey: "postgres-program-unknown",
        prompt: "run",
      })
      const [initial] = yield* claims.claimReadyRuns({ workerId: "postgres-program-crash", limit: 1 })
      const claim = { runId: receipt.runId, ownerId: initial!.workerId, attemptFence: initial!.attemptFence }
      const request = { operation: "echo", tool: "echo", input: "value" }
      yield* store.reserveProgramOperation({
        ...claim,
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
      yield* store.startProgramOperation({ ...claim, operation: "echo" })
      yield* host.execute(claim)
      expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
      yield* runtime.resolveOperation({
        runId: receipt.runId,
        operationId: "echo",
        idempotencyKey: "postgres-program-resolution",
        resolution: { _tag: "Succeeded", value: "recovered" },
      })
      const [recovery] = yield* claims.claimReadyRuns({ workerId: "postgres-program-recovery", limit: 1 })
      yield* host.execute({
        runId: receipt.runId,
        ownerId: recovery!.workerId,
        attemptFence: recovery!.attemptFence,
      })
      expect((yield* runtime.snapshot(receipt.runId)).outcome).toMatchObject({
        _tag: "Succeeded",
        result: { _tag: "Program", value: "recovered|recovered" },
      })
      expect(fixture.counts().toolCalls).toBe(0)
    }).pipe(
      Effect.provide(
        Runtime.layerPostgres({
          url,
          resolver: fixture.resolver,
          addresses: [
            {
              address: programAddress,
              executable: programExecutable,
              registrations: registrationsFor(programExecutable),
            },
          ],
        }),
      ),
      Effect.scoped,
    )
  })
})
