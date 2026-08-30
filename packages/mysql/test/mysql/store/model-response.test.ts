import { layer as backendLayer } from "@tenetkit/mysql"
import { beforeAll } from "vitest"
import { describe, expect, layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Errors, RunExecutor, RunClaims, Runtime, RuntimeWorker, RunStore } from "tenetkit/runtime"
import {
  agentMapProgramFixture,
  approvalProgramFixture,
  programAddress,
  programExecutable,
  programFixture,
} from "../../../../tenetkit/test/runtime/program/fixture.js"
import { mysqlAvailable, mysqlDatabase } from "../runtime/environment.js"
import { registrationsFor } from "../../../../tenetkit/test/runtime/execution/fixtures.js"
import {
  programBudgetContract,
  programCancellationFenceContract,
  programCancellationFinalizerContract,
  programReplayDivergenceContract,
  programSettledReplayContract,
  programUnknownOutcomeContract,
} from "../../../../tenetkit/test/runtime/program/store-contract.js"

const describeMysql = describe.runIf(mysqlAvailable)

const database = mysqlDatabase("program")

const programAddresses = [
  { address: programAddress, executable: programExecutable, registrations: registrationsFor(programExecutable) },
]

describeMysql("mysql Program store contract", () => {
  beforeAll(database.provisioned, 60_000)

  {
    const url = database.url
    const fixture = programFixture()
    const runtimeLayer = backendLayer({
      url,
      source: "mysql-test",
      resolver: fixture.resolver,
      addresses: programAddresses,
    })
    layer(database.provision(runtimeLayer), { excludeTestServices: true })(
      "enforces budgets, replay identity, and cancellation fences",
      (it) => {
        it.effect("enforces budgets, replay identity, and cancellation fences", () =>
          database.truncated.pipe(
            Effect.andThen(programBudgetContract),
            Effect.andThen(programReplayDivergenceContract),
            Effect.andThen(programSettledReplayContract),
            Effect.andThen(programCancellationFinalizerContract),
            Effect.andThen(programCancellationFenceContract),
          ),
        )
      },
    )
  }

  {
    const url = database.url
    const fixture = programFixture()
    const runtimeLayer = RuntimeWorker.layer({ workerId: "mysql-exact-root-worker" }).pipe(
      Layer.provideMerge(
        backendLayer({
          url,
          source: "mysql-test",
          resolver: fixture.resolver,
          addresses: [],
        }),
      ),
    )
    layer(database.provision(runtimeLayer), { excludeTestServices: true })(
      "claims and executes a running parentless exact root without a lane",
      (it) => {
        it.effect("claims and executes a running parentless exact root without a lane", () =>
          Effect.gen(function* () {
            yield* database.truncated
            const runtime = yield* Runtime.Runtime
            const worker = yield* RuntimeWorker.RuntimeWorker
            const receipt = yield* runtime.start({
              executable: programExecutable,
              registrations: registrationsFor(programExecutable),
              sessionId: "mysql-exact-root-worker",
              idempotencyKey: "mysql-exact-root-worker",
              prompt: "run",
            })
            const claimed = yield* worker.poll
            yield* worker.idle
            expect(receipt.childRunIds).toEqual([])
            expect(claimed.map((item) => item.run.runId)).toEqual([receipt.runId])
            expect((yield* runtime.inspect(receipt.runId)).status).toBe("succeeded")
          }),
        )
      },
    )
  }

  {
    const url = database.url
    const fixture = programFixture()
    const runtimeLayer = backendLayer({
      url,
      source: "mysql-test",
      resolver: fixture.resolver,
      addresses: programAddresses,
    })
    layer(database.provision(runtimeLayer), { excludeTestServices: true })(
      "resolves a crashed non-idempotent Program operation without redispatch",
      (it) => {
        it.effect("resolves a crashed non-idempotent Program operation without redispatch", () =>
          database.truncated.pipe(
            Effect.andThen(programUnknownOutcomeContract("mysql-program-resolution")),
            Effect.andThen(Effect.sync(() => expect(fixture.counts().toolCalls).toBe(0))),
          ),
        )
      },
    )
  }

  {
    const url = database.url
    const fixture = programFixture()
    const runtimeLayer = backendLayer({
      url,
      source: "mysql-test",
      resolver: fixture.resolver,
      addresses: programAddresses,
    })
    layer(database.provision(runtimeLayer), { excludeTestServices: true })(
      "atomically records and replays Program tool and log operations",
      (it) => {
        it.effect("atomically records and replays Program tool and log operations", () =>
          Effect.gen(function* () {
            yield* database.truncated
            const runtime = yield* Runtime.Runtime
            const store = yield* RunStore.RunStore
            const claims = yield* RunClaims.RunClaims
            const host = yield* RunExecutor.RunExecutor
            const receipt = yield* runtime.send({
              to: programAddress,
              sessionId: "mysql-program",
              idempotencyKey: "mysql-program",
              prompt: "run",
            })
            const [claim] = yield* claims.claimReadyRuns({ workerId: "mysql-program", limit: 1 })
            yield* host.execute({
              runId: receipt.runId,
              ownerId: claim!.workerId,
              attemptFence: claim!.attemptFence,
            })
            const runId = receipt.runId
            expect((yield* runtime.inspect(runId)).status).toBe("succeeded")
            expect(yield* store.getProgramOperation({ runId, operation: "echo" })).toMatchObject({
              status: "succeeded",
            })
            expect(yield* store.getProgramOperation({ runId, operation: "summary" })).toMatchObject({
              status: "succeeded",
            })
            expect(fixture.counts()).toEqual({ toolCalls: 1, logs: 1 })
          }),
        )
      },
    )
  }

  {
    const url = database.url
    const fixture = approvalProgramFixture()
    const options = {
      url,
      source: "mysql-test",
      resolver: fixture.resolver,
      addresses: programAddresses,
    }
    let runId = ""
    layer(database.provision(backendLayer(options)), { excludeTestServices: true })(
      "atomically reserves one approval response and resumes the Program operation",
      (it) => {
        it.effect("atomically reserves one approval response and resumes the Program operation", () =>
          Effect.gen(function* () {
            yield* database.truncated
            const runtime = yield* Runtime.Runtime
            const store = yield* RunStore.RunStore
            const claims = yield* RunClaims.RunClaims
            const host = yield* RunExecutor.RunExecutor
            const receipt = yield* runtime.send({
              to: programAddress,
              sessionId: "mysql-program-approval",
              idempotencyKey: "mysql-program-approval",
              prompt: "run",
            })
            runId = receipt.runId
            const [first] = yield* claims.claimReadyRuns({ workerId: "mysql-program", limit: 1 })
            yield* host.execute({
              runId: receipt.runId,
              ownerId: first!.workerId,
              attemptFence: first!.attemptFence,
            })
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
          }).pipe(
            Effect.andThen(
              Effect.suspend(() =>
                Effect.gen(function* () {
                  const runtime = yield* Runtime.Runtime
                  const store = yield* RunStore.RunStore
                  const claims = yield* RunClaims.RunClaims
                  const host = yield* RunExecutor.RunExecutor
                  const [claim] = yield* claims.claimReadyRuns({ workerId: "mysql-program-resume", limit: 1 })
                  yield* host.execute({ runId, ownerId: claim!.workerId, attemptFence: claim!.attemptFence })
                  expect(yield* store.getProgramOperation({ runId, operation: "echo" })).toMatchObject({
                    status: "succeeded",
                  })
                  expect((yield* runtime.inspect(runId)).status).toBe("succeeded")
                }),
              ),
            ),
          ),
        )
      },
    )
  }

  {
    const url = database.url
    const fixture = approvalProgramFixture()
    const runtimeLayer = backendLayer({
      url,
      source: "mysql-test",
      resolver: fixture.resolver,
      addresses: programAddresses,
    })
    layer(database.provision(runtimeLayer), { excludeTestServices: true })(
      "does not reopen a cancelled Program approval operation",
      (it) => {
        it.effect("does not reopen a cancelled Program approval operation", () =>
          Effect.gen(function* () {
            yield* database.truncated
            const runtime = yield* Runtime.Runtime
            const store = yield* RunStore.RunStore
            const claims = yield* RunClaims.RunClaims
            const host = yield* RunExecutor.RunExecutor
            const receipt = yield* runtime.send({
              to: programAddress,
              sessionId: "mysql-program-cancelled-approval",
              idempotencyKey: "mysql-program-cancelled-approval",
              prompt: "run",
            })
            const [claim] = yield* claims.claimReadyRuns({ workerId: "mysql-program-cancelled-approval", limit: 1 })
            yield* host.execute({
              runId: receipt.runId,
              ownerId: claim!.workerId,
              attemptFence: claim!.attemptFence,
            })
            const operation = yield* store.getProgramOperation({ runId: receipt.runId, operation: "echo" })
            if (operation?.waitId === undefined) return yield* Effect.die("Program approval wait is missing")
            yield* runtime.cancel({ runId: receipt.runId, reason: "stop" })
            expect(
              yield* runtime
                .respond({ runId: receipt.runId, waitId: operation.waitId, resolution: { _tag: "Approved" } })
                .pipe(Effect.flip),
            ).toBeInstanceOf(Errors.RunTerminal)
            expect(yield* store.getProgramOperation({ runId: receipt.runId, operation: "echo" })).toMatchObject({
              status: "failed",
            })
            expect((yield* store.loadProgramState(receipt.runId))?.activeSlots).toBe(0)
            expect(fixture.counts().executions).toBe(0)
          }),
        )
      },
    )
  }

  {
    const url = database.url
    const fixture = agentMapProgramFixture()
    const runtimeLayer = backendLayer({
      url,
      source: "mysql-test",
      resolver: fixture.resolver,
      addresses: [
        {
          address: fixture.address,
          executable: fixture.executable,
          registrations: registrationsFor(fixture.executable),
        },
      ],
    })
    layer(database.provision(runtimeLayer), { excludeTestServices: true })(
      "claims Program children in order, wakes the parent, and settles cancellation",
      (it) => {
        it.effect("claims Program children in order, wakes the parent, and settles cancellation", () =>
          Effect.gen(function* () {
            yield* database.truncated
            const runtime = yield* Runtime.Runtime
            const store = yield* RunStore.RunStore
            const claims = yield* RunClaims.RunClaims
            const host = yield* RunExecutor.RunExecutor
            const receipt = yield* runtime.send({
              to: fixture.address,
              sessionId: "mysql-program-map",
              idempotencyKey: "mysql-program-map",
              prompt: "run",
            })
            const [parentAdmission] = yield* claims.claimReadyRuns({ workerId: "mysql-program", limit: 1 })
            yield* host.execute({
              runId: receipt.runId,
              ownerId: parentAdmission!.workerId,
              attemptFence: parentAdmission!.attemptFence,
            })
            expect(yield* store.getProgramOperation({ runId: receipt.runId, operation: "workers" })).toMatchObject({
              status: "waiting",
            })
            const firstChildren = yield* claims.claimReadyRuns({ workerId: "mysql-program", limit: 2 })
            expect(firstChildren).toHaveLength(2)
            yield* Effect.forEach(
              firstChildren,
              (claim) =>
                host.execute({ runId: claim.run.runId, ownerId: claim.workerId, attemptFence: claim.attemptFence }),
              { concurrency: "unbounded", discard: true },
            )
            const [thirdChild] = yield* claims.claimReadyRuns({ workerId: "mysql-program", limit: 1 })
            yield* host.execute({
              runId: thirdChild!.run.runId,
              ownerId: thirdChild!.workerId,
              attemptFence: thirdChild!.attemptFence,
            })
            expect(fixture.counts().childFinalizers).toBe(3)
            const [resumedParent] = yield* claims.claimReadyRuns({ workerId: "mysql-program", limit: 1 })
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
              sessionId: "mysql-program-map-cancel",
              idempotencyKey: "mysql-program-map-cancel",
              prompt: "run",
            })
            const [cancelAdmission] = yield* claims.claimReadyRuns({ workerId: "mysql-program", limit: 1 })
            yield* host.execute({
              runId: cancelled.runId,
              ownerId: cancelAdmission!.workerId,
              attemptFence: cancelAdmission!.attemptFence,
            })
            const cancelledOperation = yield* store.getProgramOperation({
              runId: cancelled.runId,
              operation: "workers",
            })
            yield* runtime.cancel({ runId: cancelled.runId, reason: "cancel admitted Program tree" })
            expect((yield* runtime.inspect(cancelled.runId)).status).toBe("cancelled")
            for (const childRunId of cancelledOperation?.childRunIds ?? []) {
              expect((yield* runtime.inspect(childRunId)).status).toBe("cancelled")
            }
            const waitId = cancelledOperation?.waitId
            if (waitId === undefined) return yield* Effect.die("cancelled Program operation wait is missing")
            expect(
              yield* runtime
                .respond({ runId: cancelled.runId, waitId, resolution: { _tag: "Approved" } })
                .pipe(Effect.flip),
            ).toBeInstanceOf(Errors.RunTerminal)
            expect(yield* runtime.signal({ runId: cancelled.runId, name: waitId }).pipe(Effect.flip)).toBeInstanceOf(
              Errors.RunTerminal,
            )
            expect(
              yield* store
                .resume({ runId: cancelled.runId, waitId, resolution: { _tag: "Approved" } })
                .pipe(Effect.flip),
            ).toBeInstanceOf(Errors.RunTerminal)
            expect(yield* store.getProgramOperation({ runId: cancelled.runId, operation: "workers" })).toMatchObject({
              status: "failed",
            })
            expect((yield* store.loadProgramState(cancelled.runId))?.activeSlots).toBe(0)
          }),
        )
      },
    )
  }
})
