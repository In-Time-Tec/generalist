import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Exit, Fiber, Layer, Redacted, Schema, Scope, Stream } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { PgClient } from "@effect/sql-pg"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, ToolExecutor } from "@batonfx/core"
import {
  Address,
  Cursor,
  Errors,
  ExecutionHost,
  ExecutableResolver,
  RunClaims,
  RunSchema,
  Runtime,
  RuntimeWorker,
  RunStore,
} from "../../src/index.js"
import { SCHEMA_META_TABLE, SCHEMA_VERSION, schemaChecksum } from "../../src/sql/postgres/schema.js"
import {
  alternateAssistantRef,
  assistantAddress,
  assistantRef,
  completedResult,
  emptyTranscript,
  openWait,
  suspension,
  researcherRef,
  registrationsFor,
  textPrompt,
} from "../helpers.js"
import { postgresAvailable, postgresDatabase, postgresLayer, postgresWithWorker, uniqueSession } from "./helpers.js"
import { testExecutable } from "../identity.js"

const scopedWith =
  <A, E>(layerValue: Layer.Layer<A, E, never>) =>
  <B, E2, R2 extends A | Scope.Scope>(effect: Effect.Effect<B, E2, R2>) =>
    Effect.scoped(Effect.flatMap(Layer.build(layerValue), (context) => effect.pipe(Effect.provideContext(context))))

const encodeJson = (value: unknown): string => Schema.encodeSync(Schema.UnknownFromJsonString)(value)
const decodeJson = (text: string): Record<string, any> =>
  Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Any)))(text)

const describePostgres = postgresAvailable ? describe.sequential : describe.skip

const database = postgresDatabase("store")
const url = database.url

const withSchema = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    yield* database.ready
    return yield* effect
  })

const admitWaitForCancellation = (waitId: string) =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore.RunStore
    const claims = yield* RunClaims.RunClaims
    const receipt = yield* runtime.send({
      to: assistantAddress,
      sessionId: uniqueSession(`cancelled-wait-${waitId}`),
      idempotencyKey: `cancelled-wait-${waitId}`,
      prompt: textPrompt("wait"),
    })
    const [parentClaim] = yield* claims.claimReadyRuns({ workerId: "cancelled-wait", limit: 1, lease: "10 seconds" })
    if (parentClaim === undefined) return yield* Effect.die("cancelled wait parent claim is missing")
    yield* store.suspend({
      runId: receipt.runId,
      ownerId: parentClaim.workerId,
      attemptFence: parentClaim.attemptFence,
      wait: openWait({ waitId: waitId }),
      suspension: suspension({ waitId: waitId }),
    })
    yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`
        UPDATE baton_runs
        SET status = 'running', owner_worker_id = ${parentClaim.workerId}
        WHERE run_id = ${receipt.runId}
      `
    }).pipe(scopedWith(PgClient.layer({ url: Redacted.make(url) })))
    return {
      runtime,
      store,
      runId: receipt.runId,
      claim: { runId: receipt.runId, ownerId: parentClaim.workerId, attemptFence: parentClaim.attemptFence },
    }
  })

const exactRegistrations = () => {
  const pins = new Set<string>()
  for (const entry of assistantRef.manifest.entries) {
    if (entry._tag !== "Agent") continue
    pins.add(entry.manifest.model)
    for (const value of [...entry.manifest.tools, ...entry.manifest.skills, ...entry.manifest.services]) {
      pins.add(value.pin)
    }
    if (entry.manifest.policy._tag === "Pinned") pins.add(entry.manifest.policy.pin)
    if (entry.manifest.compaction !== undefined) {
      pins.add(entry.manifest.compaction.service)
      pins.add(entry.manifest.compaction.summaryModel)
    }
  }
  return [...pins].map((pin) => ({ pin, codec: "postgres-test", version: "1", payload: { route: "exact" } }))
}

const expireLease = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      UPDATE baton_runs
      SET lease_expires_at = NOW() - INTERVAL '1 second'
      WHERE run_id = ${runId}
    `
  }).pipe(scopedWith(PgClient.layer({ url: Redacted.make(url) })))

const bumpSchemaVersion = (version: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`UPDATE ${sql(SCHEMA_META_TABLE)} SET version = ${version} WHERE id = 1`
  }).pipe(scopedWith(PgClient.layer({ url: Redacted.make(url) })))

const corruptChecksum = () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`UPDATE ${sql(SCHEMA_META_TABLE)} SET checksum = 'deadbeef' WHERE id = 1`
  }).pipe(scopedWith(PgClient.layer({ url: Redacted.make(url) })))

const corruptEventExecutableRef = (runId: string, executableRef: unknown) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const row = (yield* sql<{ event_json: string }>`
      SELECT event_json FROM baton_run_events WHERE run_id = ${runId} ORDER BY sequence LIMIT 1
    `)[0]!
    const event = decodeJson(row.event_json)
    event.executableRef = executableRef
    yield* sql`
      UPDATE baton_run_events SET event_json = ${encodeJson(event)}
      WHERE run_id = ${runId} AND sequence = 0
    `
  }).pipe(scopedWith(PgClient.layer({ url: Redacted.make(url) })))

const markDirty = () =>
  RunSchema.markDirty("postgres-test").pipe(scopedWith(PgClient.layer({ url: Redacted.make(url) })))

const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

describePostgres("postgres run store", () => {
  it.live("paginates every Run in deterministic keyset order beyond one scheduler window", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const admitted: Array<string> = []
        for (let index = 0; index < 70; index += 1) {
          const receipt = yield* runtime.send({
            to: assistantAddress,
            sessionId: uniqueSession(`list-window-${index}`),
            idempotencyKey: `list-window-${index}`,
            prompt: textPrompt(`run ${index}`),
          })
          admitted.push(receipt.runId)
        }
        const listed: Array<string> = []
        let afterRunId: string | undefined
        do {
          const page = yield* store.list({
            order: "oldest",
            limit: 16,
            ...(afterRunId === undefined ? {} : { afterRunId }),
          })
          listed.push(...page.map((run) => run.runId))
          afterRunId = page.length === 16 ? page[page.length - 1]?.runId : undefined
          if (page.length < 16) break
        } while (afterRunId !== undefined)
        expect(listed).toHaveLength(70)
        expect(new Set(listed)).toEqual(new Set(admitted))
      }).pipe(scopedWith(postgresLayer(url))),
    ),
  )

  it.live("settles cancel-first completeOperation Unknown without rewriting uncertainty", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const claims = yield* RunClaims.RunClaims
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("complete-unknown-cancel"),
          idempotencyKey: "complete-unknown-cancel",
          prompt: textPrompt("unknown"),
        })
        const [claimed] = yield* claims.claimReadyRuns({ workerId: "complete-unknown-cancel", limit: 1 })
        if (claimed === undefined) return yield* Effect.die("claim missing")
        const claim = {
          runId: receipt.runId,
          ownerId: claimed.workerId,
          attemptFence: claimed.attemptFence,
        }
        const operation = yield* store.recordOperation({
          ...claim,
          operationKey: "never:complete-unknown-cancel",
          kind: "send",
          inputDigest: "unknown",
          input: {},
          replayPolicy: "never",
          attempt: 1,
        })
        yield* store.startOperation({ ...claim, operationId: operation.operationId })
        yield* runtime.cancel({ runId: receipt.runId, reason: "cancel first" })
        const completed = yield* store.completeOperation({
          ...claim,
          operationId: operation.operationId,
          outcome: { _tag: "Unknown" },
        })
        expect(completed.status).toBe("unknown")
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelling")
        yield* store.fail({ ...claim, error: Errors.AgentExecutionFailure.make({ message: "interrupted" }) })
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelled")
        expect((yield* store.getOperation({ runId: receipt.runId, operationId: operation.operationId })).status).toBe(
          "unknown",
        )
      }).pipe(scopedWith(postgresLayer(url))),
    ),
  )

  it.live("persists exact-start registrations and replays admission idempotently", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const input = {
          executable: assistantRef,
          registrations: exactRegistrations(),
          sessionId: uniqueSession("exact-start"),
          idempotencyKey: "exact-start",
          prompt: textPrompt("exact"),
          initialChildren: [
            {
              invocationId: "initial-research",
              idempotencyKey: "initial-research",
              selection: "researcher",
              sessionId: uniqueSession("exact-start-child"),
              prompt: textPrompt("research"),
            },
          ],
        }
        const first = yield* runtime.start(input)
        const duplicate = yield* runtime.start(input)
        const execution = yield* store.loadExecution(first.runId)
        expect(duplicate).toMatchObject({ runId: first.runId, duplicate: true })
        expect(duplicate.childRunIds).toEqual(first.childRunIds)
        expect((yield* store.loadExecution(first.childRunIds[0]!)).executableRef).toEqual(researcherRef.ref)
        expect(execution.registrations).toEqual(
          [...input.registrations].toSorted((left, right) => left.pin.localeCompare(right.pin)),
        )
        expect(
          yield* runtime
            .start({
              ...input,
              initialChildren: [{ ...input.initialChildren[0]!, prompt: textPrompt("changed") }],
            })
            .pipe(Effect.flip),
        ).toBeInstanceOf(Errors.IdempotencyConflict)
        const conflict = yield* runtime
          .start({
            ...input,
            idempotencyKey: "changed-registration",
            registrations: input.registrations.map((registration, index) =>
              index === 0
                ? {
                    pin: registration.pin,
                    codec: registration.codec,
                    version: registration.version,
                    payload: { route: "changed" },
                  }
                : registration,
            ),
          })
          .pipe(Effect.flip)
        expect(conflict).toBeInstanceOf(Errors.ExecutableRegistrationConflict)
      }).pipe(scopedWith(postgresLayer(url))),
    ),
  )

  it.live("applies schema and reports multi-worker capability", () =>
    withSchema(
      Effect.gen(function* () {
        const store = yield* RunStore.RunStore
        const info = yield* store.info
        expect(info).toEqual({ durability: "durable", backend: "postgres", multiWorker: true })
        expect(schemaChecksum().length).toBe(64)
      }).pipe(scopedWith(postgresLayer(url))),
    ),
  )

  it.live("persists the exact resolution supplied to RunStore.resume", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const claims = yield* RunClaims.RunClaims
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("direct-resume"),
          idempotencyKey: "direct-resume",
          prompt: "wait",
        })
        const claimed = (yield* claims.claimReadyRuns({ workerId: "direct-resume", limit: 1, lease: "10 seconds" }))[0]!
        yield* store.suspend({
          runId: receipt.runId,
          ownerId: claimed.workerId,
          attemptFence: claimed.attemptFence,
          wait: openWait({ waitId: "wait:direct-resume" }),
          suspension: suspension({ waitId: "wait:direct-resume" }),
        })
        const resolution = { _tag: "Denied" as const, reason: "postgres exact resolution" }
        const resumeInput = { runId: receipt.runId, waitId: "wait:direct-resume", resolution }
        yield* store.resume(resumeInput)
        const resumed = (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 10 })).find(
          (event) => event._tag === "RunResumed",
        )
        expect(resumed).toEqual(expect.objectContaining({ resolution }))
      }).pipe(scopedWith(postgresLayer(url))),
    ),
  )

  it.live("verify-only startup rejects SchemaUpgradeRequired without DDL", () =>
    withSchema(
      Effect.gen(function* () {
        yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql`UPDATE ${sql(SCHEMA_META_TABLE)} SET version = 0 WHERE id = 1`
        }).pipe(scopedWith(PgClient.layer({ url: Redacted.make(url) })))
        const failed = yield* Effect.exit(scopedWith(postgresLayer(url))(Effect.void))
        expect(Exit.isFailure(failed)).toBe(true)
        yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql`
            UPDATE ${sql(SCHEMA_META_TABLE)}
            SET version = ${SCHEMA_VERSION}, checksum = ${schemaChecksum()}, dirty = FALSE
            WHERE id = 1
          `
        }).pipe(scopedWith(PgClient.layer({ url: Redacted.make(url) })))
      }),
    ),
  )

  it.live("persists FIFO steering and orders completion against admission", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const claims = yield* RunClaims.RunClaims
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("steering"),
          idempotencyKey: "run",
          prompt: "start",
        })
        yield* runtime.steer({ runId: receipt.runId, idempotencyKey: "one", prompt: "first" })
        yield* runtime.steer({ runId: receipt.runId, idempotencyKey: "two", prompt: "second" })
        const [claim] = yield* claims.claimReadyRuns({ workerId: "steering", limit: 1, lease: "10 seconds" })
        expect(claim).toBeDefined()
        const executionClaim = { runId: claim!.run.runId, ownerId: claim!.workerId, attemptFence: claim!.attemptFence }
        const entries = yield* store.readSteering(executionClaim)
        expect(entries.map((entry) => JSON.stringify(entry.prompt))).toEqual([
          expect.stringContaining("first"),
          expect.stringContaining("second"),
        ])
        expect(yield* store.complete({ ...executionClaim, result: completedResult("early") })).toMatchObject({
          _tag: "SteeringPending",
        })
      }).pipe(scopedWith(postgresLayer(url))),
    ),
  )

  it.live("exact duplicate admission and changed-payload conflict", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const sessionId = uniqueSession("idem")
        const runId = `run:${sessionId}`
        const first = yield* runtime.send({
          runId,
          to: assistantAddress,
          sessionId,
          idempotencyKey: "same",
          prompt: textPrompt("one"),
        })
        const dup = yield* runtime.send({
          runId,
          to: assistantAddress,
          sessionId,
          idempotencyKey: "same",
          prompt: textPrompt("one"),
        })
        expect(dup.duplicate).toBe(true)
        expect(dup.runId).toBe(first.runId)
        expect(first.runId).toBe(runId)
        yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql`
            UPDATE baton_runs SET
              executable_ref_json = ${encodeJson(alternateAssistantRef.ref)},
              executable_manifest_json = ${encodeJson(alternateAssistantRef.manifest)}
            WHERE run_id = ${runId}
          `
        }).pipe(scopedWith(PgClient.layer({ url: Redacted.make(url) })))
        const authorityConflict = yield* runtime
          .send({ runId, to: assistantAddress, sessionId, idempotencyKey: "same", prompt: textPrompt("one") })
          .pipe(Effect.flip)
        expect(authorityConflict).toBeInstanceOf(Errors.IdempotencyConflict)
        const runIdConflict = yield* runtime
          .send({
            runId: `${runId}:other`,
            to: assistantAddress,
            sessionId,
            idempotencyKey: "same",
            prompt: textPrompt("one"),
          })
          .pipe(Effect.flip)
        expect(runIdConflict).toBeInstanceOf(Errors.RunIdConflict)
        const conflict = yield* runtime
          .send({
            to: assistantAddress,
            sessionId,
            idempotencyKey: "same",
            prompt: textPrompt("two"),
          })
          .pipe(Effect.flip)
        expect(conflict).toBeInstanceOf(Errors.IdempotencyConflict)
      }).pipe(scopedWith(postgresLayer(url))),
    ),
  )

  it.live("locks admission and rejects spawning from a terminal parent", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const claims = yield* RunClaims.RunClaims
        const parent = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("terminal-parent"),
          idempotencyKey: "parent",
          prompt: textPrompt("parent"),
        })
        const [claim] = yield* claims.claimReadyRuns({ workerId: "terminal-parent", limit: 1 })
        yield* store.complete({
          runId: parent.runId,
          ownerId: claim!.workerId,
          attemptFence: claim!.attemptFence,
          result: completedResult("done"),
        })
        const failure = yield* runtime
          .spawn({
            parentRunId: parent.runId,
            invocationId: "too-late",
            selection: "researcher",
            prompt: textPrompt("child"),
          })
          .pipe(Effect.flip)
        expect(failure).toBeInstanceOf(Errors.RunTerminal)
      }).pipe(scopedWith(postgresLayer(url))),
    ),
  )

  it.live("fifo blocks successors until head terminals after claim", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const claims = yield* RunClaims.RunClaims
        const sessionId = uniqueSession("fifo")
        const head = yield* runtime.send({
          to: assistantAddress,
          sessionId,
          idempotencyKey: "a",
          prompt: textPrompt("a"),
        })
        const blocked = yield* runtime.send({
          to: assistantAddress,
          sessionId,
          idempotencyKey: "b",
          prompt: textPrompt("b"),
        })
        expect((yield* runtime.inspect(head.runId)).status).toBe("queued")
        expect((yield* runtime.inspect(blocked.runId)).status).toBe("queued")
        const claimed = yield* claims.claimReadyRuns({ workerId: "w1", limit: 1, lease: "10 seconds" })
        expect(claimed.map((item) => item.run.runId)).toEqual([head.runId])
        expect((yield* runtime.inspect(head.runId)).status).toBe("running")
        expect((yield* runtime.inspect(blocked.runId)).status).toBe("queued")
        yield* claims.commitWithClaim({
          runId: head.runId,
          workerId: "w1",
          attemptFence: claimed[0]!.attemptFence,
          transition: "complete",
          result: completedResult("done"),
        })
        const claimedNext = yield* claims.claimReadyRuns({ workerId: "w1", limit: 2, lease: "10 seconds" })
        expect(claimedNext.map((item) => item.run.runId)).toEqual([blocked.runId])
        expect((yield* runtime.inspect(blocked.runId)).status).toBe("running")
      }).pipe(scopedWith(postgresLayer(url))),
    ),
  )

  it.live("two and three workers distribute independent lanes", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const claims = yield* RunClaims.RunClaims
        const receipts = yield* Effect.all(
          Array.from({ length: 6 }, (_, index) =>
            runtime.send({
              to: assistantAddress,
              sessionId: uniqueSession(`lane-${index}`),
              idempotencyKey: `k${index}`,
              prompt: textPrompt(`k${index}`),
            }),
          ),
          { concurrency: 6 },
        )
        const w1 = yield* claims.claimReadyRuns({ workerId: "worker-a", limit: 2, lease: "10 seconds" })
        const w2 = yield* claims.claimReadyRuns({ workerId: "worker-b", limit: 2, lease: "10 seconds" })
        const w3 = yield* claims.claimReadyRuns({ workerId: "worker-c", limit: 2, lease: "10 seconds" })
        const claimedIds = [...w1, ...w2, ...w3].map((item) => item.run.runId)
        expect(new Set(claimedIds).size).toBe(6)
        expect(claimedIds.toSorted()).toEqual(receipts.map((receipt) => receipt.runId).toSorted())
      }).pipe(scopedWith(postgresLayer(url))),
    ),
  )

  it.live("stale lease takeover and stale commit rejection", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const claims = yield* RunClaims.RunClaims
        const sessionId = uniqueSession("stale")
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId,
          idempotencyKey: "stale",
          prompt: textPrompt("stale"),
        })
        const first = yield* claims.claimReadyRuns({ workerId: "owner-a", limit: 1, lease: "2 seconds" })
        expect(first).toHaveLength(1)
        const fenceA = first[0]!.attemptFence
        yield* expireLease(receipt.runId)
        const second = yield* claims.claimReadyRuns({ workerId: "owner-b", limit: 1, lease: "10 seconds" })
        expect(second).toHaveLength(1)
        expect(second[0]!.attemptFence).toBeGreaterThan(fenceA)
        const stale = yield* claims
          .commitWithClaim({
            runId: receipt.runId,
            workerId: "owner-a",
            attemptFence: fenceA,
            transition: "complete",
            result: completedResult("late"),
          })
          .pipe(Effect.flip)
        expect(stale).toBeInstanceOf(Errors.StaleClaim)
        yield* claims.commitWithClaim({
          runId: receipt.runId,
          workerId: "owner-b",
          attemptFence: second[0]!.attemptFence,
          transition: "complete",
          result: completedResult("ok"),
        })
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("succeeded")
      }).pipe(scopedWith(postgresLayer(url))),
    ),
  )

  it.live("rejects emitAgentEvent after a concurrent lease takeover without changing newer state", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const claims = yield* RunClaims.RunClaims
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("agent-event-takeover"),
          idempotencyKey: "agent-event-takeover",
          prompt: textPrompt("agent-event-takeover"),
        })
        const [claimed] = yield* claims.claimReadyRuns({ workerId: "owner-a", limit: 1, lease: "10 seconds" })
        const claim = {
          runId: receipt.runId,
          ownerId: claimed!.workerId,
          attemptFence: claimed!.attemptFence,
        }
        const locked = yield* Deferred.make<void>()
        const takeover = Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql.withTransaction(
            Effect.gen(function* () {
              const pid = (yield* sql<{ readonly pid: number }>`SELECT pg_backend_pid() AS pid`)[0]!.pid
              yield* sql`SELECT run_id FROM baton_runs WHERE run_id = ${receipt.runId} FOR UPDATE`
              yield* Deferred.succeed(locked, undefined)
              let blocked = false
              for (let attempt = 0; attempt < 200 && !blocked; attempt++) {
                const [waiting] = yield* sql<{ readonly blocked: boolean }>`
                  SELECT EXISTS (
                    SELECT 1 FROM pg_stat_activity
                    WHERE ${pid} = ANY(pg_blocking_pids(pid))
                  ) AS blocked
                `
                blocked = waiting?.blocked === true
                if (!blocked) yield* Effect.sleep("10 millis")
              }
              expect(blocked).toBe(true)
              yield* sql`
                UPDATE baton_runs
                SET owner_worker_id = 'owner-b', attempt_fence = attempt_fence + 1,
                  lease_expires_at = NOW() + INTERVAL '10 seconds', updated_at = NOW()
                WHERE run_id = ${receipt.runId}
              `
            }),
          )
        }).pipe(scopedWith(PgClient.layer({ url: Redacted.make(url) })))

        const takeoverFiber = yield* Effect.forkScoped(takeover)
        yield* Deferred.await(locked)
        const staleFiber = yield* Effect.forkScoped(
          store.emitAgentEvent({
            ...claim,
            event: {
              _tag: "TurnCompleted",
              turn: 0,
              transcript: emptyTranscript,
              usage: {
                inputTokens: { total: 0, uncached: 0, cacheRead: undefined, cacheWrite: undefined },
                outputTokens: { total: 0, text: 0, reasoning: 0 },
              },
            },
          }),
        )
        yield* Fiber.join(takeoverFiber)
        const stale = yield* Fiber.join(staleFiber).pipe(Effect.flip)
        expect(stale).toBeInstanceOf(Errors.StaleClaim)

        const state = yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          const [run] = yield* sql<{
            readonly owner_worker_id: string | null
            readonly attempt_fence: number
          }>`
            SELECT owner_worker_id, attempt_fence
            FROM baton_runs WHERE run_id = ${receipt.runId}
          `
          const [events] = yield* sql<{ readonly count: string }>`
            SELECT COUNT(*) AS count FROM baton_run_events
            WHERE run_id = ${receipt.runId} AND event_json LIKE '%"TurnCompleted"%'
          `
          return { run, eventCount: Number(events!.count) }
        }).pipe(scopedWith(PgClient.layer({ url: Redacted.make(url) })))
        expect(state.run).toEqual({
          owner_worker_id: "owner-b",
          attempt_fence: claim.attemptFence + 1,
        })
        expect(state.eventCount).toBe(0)
      }).pipe(scopedWith(postgresLayer(url))),
    ),
  )

  it.live("worker layer ticks claim and refresh leases", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const worker = yield* RuntimeWorker.RuntimeWorker
        const sessionId = uniqueSession("worker")
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId,
          idempotencyKey: "w",
          prompt: textPrompt("w"),
        })
        const claimed = yield* worker.tick
        const claim = claimed.find((item) => item.run.runId === receipt.runId)!
        expect(claim).toBeDefined()
        const again = yield* worker.tick
        expect(again.some((item) => item.run.runId === receipt.runId)).toBe(true)
        expect(again).toHaveLength(1)
        yield* runtime.cancel({ runId: receipt.runId, reason: "stop" })
        expect(
          yield* (yield* RunClaims.RunClaims).refreshLease({
            runId: receipt.runId,
            workerId: "tick-worker",
            attemptFence: claim.attemptFence,
            lease: "10 seconds",
          }),
        ).toBe(false)
      }).pipe(scopedWith(postgresWithWorker({ url, workerId: "tick-worker", concurrency: 2 }))),
    ),
  )

  it.live("expired non-idempotent running operations become unknown", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const driver = yield* RunStore.RunStore
        const claims = yield* RunClaims.RunClaims
        const sessionId = uniqueSession("ops")
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId,
          idempotencyKey: "op",
          prompt: textPrompt("op"),
        })
        yield* claims.claimReadyRuns({ workerId: "ops-w", limit: 1, lease: "10 seconds" })
        const recorded = yield* driver.recordOperation({
          ...(yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })),
          runId: receipt.runId,
          operationKey: "tool:counter",
          kind: "tool",
          inputDigest: "digest:1",
          input: { n: 1 },
          replayPolicy: "never",
          attempt: 1,
        })
        const operationClaim = yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })
        yield* driver.startOperation({ ...operationClaim, operationId: recorded.operationId })
        const expired = yield* driver.expireRunningOperation({
          ...operationClaim,
          operationId: recorded.operationId,
        })
        expect(expired.outcome).toBe("unknown")
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
        expect(yield* claims.claimReadyRuns({ workerId: "blocked", limit: 1, lease: "10 seconds" })).toEqual([])
        expect(
          (yield* driver.claimExecution({ runId: receipt.runId, ownerId: "blocked" }).pipe(Effect.flip))._tag,
        ).toBe("@batonfx/runtime/RuntimeUnavailable")
        yield* runtime.resolveOperation({
          runId: receipt.runId,
          operationId: recorded.operationId,
          idempotencyKey: "resolve:postgres",
          resolution: { _tag: "Succeeded", value: "recovered" },
        })
        const [resumed] = yield* claims.claimReadyRuns({ workerId: "resumed", limit: 1, lease: "10 seconds" })
        expect(resumed?.run.runId).toBe(receipt.runId)
        expect((yield* driver.getOperation({ runId: receipt.runId, operationId: recorded.operationId })).result).toBe(
          "recovered",
        )
      }).pipe(scopedWith(postgresLayer(url))),
    ),
  )

  it.live("rejects stale operation completion after a concurrent lease takeover", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const claims = yield* RunClaims.RunClaims
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("operation-takeover"),
          idempotencyKey: "operation-takeover",
          prompt: textPrompt("operation-takeover"),
        })
        const [claimed] = yield* claims.claimReadyRuns({ workerId: "owner-a", limit: 1, lease: "10 seconds" })
        const claim = {
          runId: receipt.runId,
          ownerId: claimed!.workerId,
          attemptFence: claimed!.attemptFence,
        }
        const operation = yield* store.recordOperation({
          ...claim,
          operationKey: "tool:takeover",
          kind: "tool",
          inputDigest: "takeover",
          input: {},
          replayPolicy: "never",
          attempt: claimed!.run.attempt,
        })
        yield* store.startOperation({ ...claim, operationId: operation.operationId })

        const locked = yield* Deferred.make<void>()
        const takeover = Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql.withTransaction(
            Effect.gen(function* () {
              const pid = (yield* sql<{ readonly pid: number }>`SELECT pg_backend_pid() AS pid`)[0]!.pid
              yield* sql`SELECT run_id FROM baton_runs WHERE run_id = ${receipt.runId} FOR UPDATE`
              yield* sql`
                SELECT operation_id FROM baton_run_operations
                WHERE run_id = ${receipt.runId} AND operation_id = ${operation.operationId}
                FOR UPDATE
              `
              yield* Deferred.succeed(locked, undefined)
              let blocked = false
              for (let attempt = 0; attempt < 200 && !blocked; attempt++) {
                const [waiting] = yield* sql<{ readonly blocked: boolean }>`
                  SELECT EXISTS (
                    SELECT 1 FROM pg_stat_activity
                    WHERE ${pid} = ANY(pg_blocking_pids(pid))
                  ) AS blocked
                `
                blocked = waiting?.blocked === true
                if (!blocked) yield* Effect.sleep("10 millis")
              }
              expect(blocked).toBe(true)
              yield* sql`
                UPDATE baton_runs
                SET owner_worker_id = 'owner-b', attempt_fence = attempt_fence + 1,
                  lease_expires_at = NOW() + INTERVAL '10 seconds', updated_at = NOW()
                WHERE run_id = ${receipt.runId}
              `
            }),
          )
        }).pipe(scopedWith(PgClient.layer({ url: Redacted.make(url) })))

        const takeoverFiber = yield* Effect.forkScoped(takeover)
        yield* Deferred.await(locked)
        const checkpoint = {
          driverVersion: "1" as const,
          executable: assistantRef.ref,
          turn: 1,
          budget: { allocation: {}, remaining: {}, depth: 0 },
          state: {},
        }
        const staleFiber = yield* Effect.forkScoped(
          store.completeOperation({
            ...claim,
            operationId: operation.operationId,
            outcome: { _tag: "Succeeded", value: { owner: "owner-a" } },
            checkpoint,
          }),
        )
        yield* Fiber.join(takeoverFiber)
        const stale = yield* Fiber.join(staleFiber).pipe(Effect.flip)
        expect(stale).toBeInstanceOf(Errors.StaleClaim)
        expect((yield* store.getOperation({ runId: receipt.runId, operationId: operation.operationId })).status).toBe(
          "running",
        )
        const completed = yield* store.completeOperation({
          runId: receipt.runId,
          ownerId: "owner-b",
          attemptFence: claim.attemptFence + 1,
          operationId: operation.operationId,
          outcome: { _tag: "Succeeded", value: { owner: "owner-b" } },
          checkpoint,
        })
        expect(completed.status).toBe("succeeded")
      }).pipe(scopedWith(postgresLayer(url))),
    ),
  )

  it.live("wait signal timeout cancel races and first terminal wins", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const driver = yield* RunStore.RunStore
        const claims = yield* RunClaims.RunClaims
        const sessionId = uniqueSession("wait")
        const waiting = yield* runtime.send({
          to: assistantAddress,
          sessionId,
          idempotencyKey: "wait",
          prompt: textPrompt("wait"),
        })
        const successor = yield* runtime.send({
          to: assistantAddress,
          sessionId,
          idempotencyKey: "next",
          prompt: textPrompt("next"),
        })
        const claimed = yield* claims.claimReadyRuns({ workerId: "wait-w", limit: 1, lease: "10 seconds" })
        let claim = { runId: waiting.runId, ownerId: "wait-w", attemptFence: claimed[0]!.attemptFence }
        yield* driver.suspend({
          ...claim,
          wait: openWait({ waitId: "approval", reason: "approval" }),
          suspension: suspension({ waitId: "approval", reason: "approval" }),
        })
        expect((yield* runtime.inspect(successor.runId)).status).toBe("queued")
        yield* runtime.respond({ runId: waiting.runId, waitId: "approval", resolution: { _tag: "Approved" } })
        expect((yield* runtime.inspect(waiting.runId)).status).toBe("running")
        const [approvalResume] = yield* claims.claimReadyRuns({ workerId: "wait-w", limit: 1, lease: "10 seconds" })
        claim = { runId: waiting.runId, ownerId: "wait-w", attemptFence: approvalResume!.attemptFence }
        yield* driver.suspend({
          ...claim,
          wait: openWait({ waitId: "signal-me", reason: "signal" }),
          suspension: suspension({ waitId: "signal-me" }),
        })
        yield* runtime.signal({ runId: waiting.runId, name: "signal-me" })
        const [signalResume] = yield* claims.claimReadyRuns({ workerId: "wait-w", limit: 1, lease: "10 seconds" })
        claim = { runId: waiting.runId, ownerId: "wait-w", attemptFence: signalResume!.attemptFence }
        const checkpoint = {
          driverVersion: "1" as const,
          executable: assistantRef.ref,
          turn: 1,
          budget: { allocation: {}, remaining: {}, depth: 0 },
          state: { dialect: "postgres" },
        }
        for (const outcome of [
          { _tag: "Failed" as const, error: { message: "failed" } },
          { _tag: "Unknown" as const },
        ]) {
          const operation = yield* driver.recordOperation({
            ...claim,
            operationKey: `tool:${outcome._tag}`,
            kind: "tool",
            inputDigest: outcome._tag,
            input: {},
            replayPolicy: "never",
            attempt: 1,
          })
          yield* driver.startOperation({ ...claim, operationId: operation.operationId })
          yield* driver.completeOperation({ ...claim, operationId: operation.operationId, outcome, checkpoint })
        }
        expect((yield* driver.loadExecution(waiting.runId)).checkpoint).toEqual(checkpoint)
        expect((yield* runtime.inspect(waiting.runId)).status).toBe("needs-resolution")
        yield* claims.commitWithClaim({
          runId: waiting.runId,
          workerId: "wait-w",
          attemptFence: claim.attemptFence,
          transition: "complete",
          result: completedResult("done"),
        })
        const again = yield* driver
          .fail({
            runId: waiting.runId,
            ownerId: "wait-w",
            attemptFence: claim.attemptFence,
            error: Errors.AgentExecutionFailure.make({ message: "nope" }),
          })
          .pipe(Effect.flip)
        expect(again).toBeInstanceOf(Errors.StaleClaim)
        expect((yield* runtime.inspect(waiting.runId)).status).toBe("succeeded")
        const nextClaim = yield* claims.claimReadyRuns({ workerId: "wait-w", limit: 1, lease: "10 seconds" })
        expect(nextClaim[0]?.run.runId).toBe(successor.runId)
        yield* claims.releaseClaim({
          runId: successor.runId,
          workerId: "wait-w",
          attemptFence: nextClaim[0]!.attemptFence,
        })
        yield* runtime.cancel({ runId: successor.runId, reason: "stop" })
        expect((yield* runtime.inspect(successor.runId)).status).toBe("cancelled")
      }).pipe(scopedWith(postgresLayer(url))),
    ),
  )

  it.live("interrupts an active claimed Run when another process persists cancellation", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const claims = yield* RunClaims.RunClaims
        const host = yield* ExecutionHost.ExecutionHost
        const sessionId = uniqueSession("cross-process-cancel")
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId,
          idempotencyKey: "cross-process-cancel",
          prompt: textPrompt("work"),
        })
        const [claim] = yield* claims.claimReadyRuns({ workerId: "cancel-worker", limit: 1, lease: "30 seconds" })
        expect(claim).toBeDefined()

        // Model one worker holding the Run while a separate connection persists cancellation.
        const executing = yield* host
          .execute({ runId: receipt.runId, ownerId: claim!.workerId, attemptFence: claim!.attemptFence })
          .pipe(Effect.forkChild({ startImmediately: true }))
        yield* runtime.cancel({ runId: receipt.runId, reason: "cross-process" })
        yield* Fiber.join(executing)

        const settled = yield* runtime.inspect(receipt.runId)
        expect(["cancelling", "cancelled"]).toContain(settled.status)
        expect(
          yield* claims.refreshLease({
            runId: receipt.runId,
            workerId: claim!.workerId,
            attemptFence: claim!.attemptFence,
            lease: "5 seconds",
          }),
        ).toBe(false)
      }).pipe(scopedWith(postgresLayer(url))),
    ),
  )

  it.live("interrupts an active model call from a separate PostgreSQL runtime node", () =>
    withSchema(
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>()
        const lifecycle: Array<string> = []
        const agent = Agent.make({ name: "postgres-cancel-model" })
        const executable = testExecutable(agent, "postgres-cancel-model-v1")
        const address = Address.make("agent:postgres-cancel-model")
        const model = Layer.effect(
          LanguageModel.LanguageModel,
          Effect.sync(() => lifecycle.push("service acquired")).pipe(
            Effect.andThen(
              LanguageModel.make({
                generateText: () => Effect.never,
                streamText: () =>
                  Stream.fromEffect(Deferred.succeed(started, undefined)).pipe(
                    Stream.flatMap(() => Stream.never),
                    Stream.ensuring(Effect.sync(() => lifecycle.push("model finalized"))),
                  ),
              }),
            ),
            Effect.ensuring(Effect.sync(() => lifecycle.push("service finalized"))),
          ),
        )
        const resolver = ExecutableResolver.ExecutableResolver.of({
          resolve: (input) =>
            Effect.gen(function* () {
              const phase = input.runId === "pending" ? "admission" : "execution"
              lifecycle.push(`${phase} resolver acquired`)
              yield* Effect.addFinalizer(() => Effect.sync(() => lifecycle.push(`${phase} resolver finalized`)))
              return { _tag: "Agent" as const, agent: Agent.close(agent, model), attestation: executable }
            }),
        })
        const options = {
          url,
          resolver,
          addresses: [{ address, executable, registrations: registrationsFor(executable) }],
        }
        const workerLayer = RuntimeWorker.layerWorker({
          workerId: "postgres-model-worker",
          cancellationInterval: "10 millis",
          lease: "30 seconds",
        }).pipe(Layer.provideMerge(Runtime.layerPostgres(options)))
        return yield* Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const worker = yield* RuntimeWorker.RuntimeWorker
          const receipt = yield* runtime.send({
            to: address,
            sessionId: uniqueSession("cross-process-model"),
            idempotencyKey: "cross-process-model",
            prompt: "block model",
          })
          const execution = yield* worker.execute.pipe(Effect.forkChild({ startImmediately: true }))
          yield* Deferred.await(started)
          yield* scopedWith(Runtime.layerPostgres(options))(
            Runtime.Runtime.pipe(
              Effect.flatMap((otherRuntime) =>
                otherRuntime.cancel({ runId: receipt.runId, reason: "other node cancelled" }),
              ),
            ),
          )
          yield* Fiber.join(execution)
          expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelled")
          expect(lifecycle).toEqual([
            "admission resolver acquired",
            "admission resolver finalized",
            "execution resolver acquired",
            "service acquired",
            "service finalized",
            "model finalized",
            "execution resolver finalized",
          ])
        }).pipe(scopedWith(workerLayer))
      }),
    ),
  )

  it.live("interrupts an active tool call and finalizes worker resources before cancellation settles", () =>
    withSchema(
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>()
        const lifecycle: Array<string> = []
        const tool = Tool.make("block", { parameters: Schema.Struct({}), success: Schema.String })
        const agent = Agent.make({ name: "postgres-cancel-tool", toolkit: Toolkit.make(tool) })
        const executable = testExecutable(agent, "postgres-cancel-tool-v1")
        const address = Address.make("agent:postgres-cancel-tool")
        const model = Layer.effect(
          LanguageModel.LanguageModel,
          Effect.sync(() => lifecycle.push("service acquired")).pipe(
            Effect.andThen(
              LanguageModel.make({
                generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
                streamText: () =>
                  Stream.fromIterable<Response.StreamPartEncoded>([
                    Response.makePart("tool-call", {
                      id: "block-1",
                      name: "block",
                      params: {},
                      providerExecuted: false,
                    }),
                    finish,
                  ]),
              }),
            ),
            Effect.ensuring(Effect.sync(() => lifecycle.push("service finalized"))),
          ),
        )
        const executor = ToolExecutor.layerTest({
          execute: () =>
            Deferred.succeed(started, undefined).pipe(
              Effect.andThen(Effect.never),
              Effect.ensuring(Effect.sync(() => lifecycle.push("tool finalized"))),
            ),
        })
        const handlers = Toolkit.make(tool).toLayer({
          block: () => Effect.die("ToolExecutor test layer owns execution"),
        })
        const resolver = ExecutableResolver.makeStatic([
          { executable, agent: Agent.close(agent, Layer.mergeAll(model, executor, handlers)) },
        ])
        const options = {
          url,
          resolver,
          addresses: [{ address, executable, registrations: registrationsFor(executable) }],
        }
        const workerLayer = RuntimeWorker.layerWorker({
          workerId: "postgres-tool-worker",
          cancellationInterval: "10 millis",
          lease: "30 seconds",
        }).pipe(Layer.provideMerge(Runtime.layerPostgres(options)))
        return yield* Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          const worker = yield* RuntimeWorker.RuntimeWorker
          const receipt = yield* runtime.send({
            to: address,
            sessionId: uniqueSession("cross-process-tool"),
            idempotencyKey: "cross-process-tool",
            prompt: "block tool",
          })
          const execution = yield* worker.execute.pipe(Effect.forkChild({ startImmediately: true }))
          yield* Deferred.await(started)
          yield* scopedWith(Runtime.layerPostgres(options))(
            Runtime.Runtime.pipe(
              Effect.flatMap((otherRuntime) =>
                otherRuntime.cancel({ runId: receipt.runId, reason: "other node cancelled" }),
              ),
            ),
          )
          yield* Fiber.join(execution)
          expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelled")
          expect(lifecycle).toEqual(["service acquired", "service finalized", "tool finalized"])
          const unknown = (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })).find(
            (event) => event._tag === "OperationUnknown",
          )
          if (unknown?._tag !== "OperationUnknown") return yield* Effect.die("unknown operation event missing")
          expect((yield* store.getOperation({ runId: receipt.runId, operationId: unknown.operationId })).status).toBe(
            "unknown",
          )
        }).pipe(scopedWith(workerLayer))
      }),
    ),
  )

  it.live("serializes concurrent response and cancellation into one ordered outcome", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const driver = yield* RunStore.RunStore
        const claims = yield* RunClaims.RunClaims

        for (const attempt of [0, 1, 2, 3, 4, 5, 6, 7]) {
          const sessionId = uniqueSession(`race-${attempt}`)
          const admitted = yield* runtime.send({
            to: assistantAddress,
            sessionId,
            idempotencyKey: `race-${attempt}`,
            prompt: textPrompt("race"),
          })
          const [claimed] = yield* claims.claimReadyRuns({ workerId: "race-w", limit: 1, lease: "10 seconds" })
          yield* driver.suspend({
            runId: admitted.runId,
            ownerId: "race-w",
            attemptFence: claimed!.attemptFence,
            wait: openWait({ waitId: "approval", reason: "approval" }),
            suspension: suspension({ waitId: "approval", reason: "approval" }),
          })

          const respond = runtime
            .respond({ runId: admitted.runId, waitId: "approval", resolution: { _tag: "Approved" } })
            .pipe(Effect.exit)
          const cancel = runtime.cancel({ runId: admitted.runId, reason: "race" }).pipe(Effect.exit)
          const [respondExit, cancelExit] = yield* Effect.all([respond, cancel], { concurrency: "unbounded" })

          expect(cancelExit._tag).toBe("Success")
          const status = (yield* runtime.inspect(admitted.runId)).status

          if (respondExit._tag === "Success") {
            // An accepted response is never lost: it stays durably recorded even when cancellation wins the Run.
            const events = yield* driver.history({ runId: admitted.runId, cursor: Cursor.origin, limit: 200 })
            expect(events.some((event) => event._tag === "RunResumed")).toBe(true)
          }
          expect(status).toBe("cancelled")
        }
      }).pipe(scopedWith(postgresLayer(url))),
    ),
  )

  it.live("keeps duplicate responses idempotent after cancellation admission", () =>
    withSchema(
      Effect.gen(function* () {
        const { runtime, runId } = yield* admitWaitForCancellation("approval")
        const resolution = { _tag: "Approved" as const }
        yield* runtime.respond({ runId, waitId: "approval", resolution })
        yield* runtime.cancel({ runId, reason: "stop" })
        yield* runtime.respond({ runId, waitId: "approval", resolution })
        const conflict = yield* runtime
          .respond({ runId, waitId: "approval", resolution: { _tag: "Denied", reason: "changed" } })
          .pipe(Effect.flip)
        expect(conflict).toBeInstanceOf(Errors.ResponseConflict)
        expect((yield* runtime.inspect(runId)).status).toBe("cancelling")
      }).pipe(scopedWith(postgresLayer(url))),
    ),
  )

  it.live("does not resume a cancellation-requested wait", () =>
    withSchema(
      Effect.gen(function* () {
        const { runtime, store, runId, claim } = yield* admitWaitForCancellation("approval")
        yield* runtime.cancel({ runId, reason: "stop" })
        const response = yield* runtime
          .respond({ runId, waitId: "approval", resolution: { _tag: "Approved" } })
          .pipe(Effect.flip)
        expect(response).toBeInstanceOf(Errors.WaitNotOpen)
        yield* runtime.signal({ runId, name: "approval" })
        const resume = yield* store
          .resume({ runId, waitId: "approval", resolution: { _tag: "Approved" } })
          .pipe(Effect.flip)
        expect(resume).toBeInstanceOf(Errors.WaitNotOpen)
        yield* store.suspend({
          ...claim,
          wait: openWait({ waitId: "approval" }),
          suspension: suspension({ waitId: "approval" }),
        })
        const inspection = yield* runtime.inspect(runId)
        expect(inspection.status).toBe("cancelling")
        expect(inspection.wait).toMatchObject({ status: "cancelled" })
      }).pipe(scopedWith(postgresLayer(url))),
    ),
  )

  it.live("child completion reconciles without parent cancel inversion", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const claims = yield* RunClaims.RunClaims
        const sessionId = uniqueSession("child")
        const parent = yield* runtime.send({
          to: assistantAddress,
          sessionId,
          idempotencyKey: "parent",
          prompt: textPrompt("parent"),
        })
        const [parentClaim] = yield* claims.claimReadyRuns({ workerId: "parent-w", limit: 1, lease: "10 seconds" })
        const child = yield* runtime.spawn({
          parentRunId: parent.runId,
          invocationId: "inv-1",
          selection: "researcher",
          prompt: textPrompt("child"),
        })
        const [childClaim] = yield* claims.claimReadyRuns({ workerId: "child-w", limit: 1, lease: "10 seconds" })
        expect(childClaim?.run.runId).toBe(child.runId)
        yield* claims.commitWithClaim({
          runId: child.runId,
          workerId: "child-w",
          attemptFence: childClaim!.attemptFence,
          transition: "complete",
          result: completedResult("child-done"),
        })
        const parentTags = yield* runtime.events({ runId: parent.runId, cursor: -1 }).pipe(
          Stream.take(4),
          Stream.runCollect,
          Effect.map((chunk) => [...chunk].map((event) => event._tag)),
        )
        expect(parentTags).toContain("ChildLinked")
        expect(parentTags).toContain("ChildSettled")
        yield* claims.releaseClaim({
          runId: parent.runId,
          workerId: "parent-w",
          attemptFence: parentClaim!.attemptFence,
        })
        yield* runtime.cancel({ runId: parent.runId, reason: "parent-stop" })
        expect((yield* runtime.inspect(parent.runId)).status).toBe("cancelled")
        expect((yield* runtime.inspect(child.runId)).status).toBe("succeeded")
      }).pipe(scopedWith(postgresLayer(url))),
    ),
  )

  it.live("enforces and recovers durable fan-out concurrency", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const claims = yield* RunClaims.RunClaims
        const parent = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("fan-out"),
          idempotencyKey: "parent",
          prompt: "parent",
        })
        yield* claims.claimReadyRuns({ workerId: "parent", limit: 1 })
        const receipt = yield* runtime.fanOut({
          parentRunId: parent.runId,
          idempotencyKey: "reviews",
          members: [0, 1, 2].map((ordinal) => ({
            key: `review-${ordinal}`,
            selection: "researcher",
            prompt: `review-${ordinal}`,
          })),
          concurrency: 1,
          join: { _tag: "Quorum", required: 2 },
          remainder: "abandon",
        })
        expect((yield* runtime.inspect(receipt.childRunIds[0]!)).executableRef).toEqual(researcherRef.ref)
        const changed = yield* runtime
          .fanOut({
            parentRunId: parent.runId,
            idempotencyKey: "reviews",
            members: [0, 1, 2].map((ordinal) => ({
              key: `review-${ordinal}`,
              selection: ordinal === 0 ? "analyst" : "researcher",
              prompt: `review-${ordinal}`,
            })),
            concurrency: 1,
            join: { _tag: "Quorum", required: 2 },
            remainder: "abandon",
          })
          .pipe(Effect.flip)
        expect(changed).toBeInstanceOf(Errors.FanOutConflict)
        const beforeMissing = yield* runtime.inspectTree(parent.runId)
        const missing = yield* runtime
          .fanOut({
            parentRunId: parent.runId,
            idempotencyKey: "missing",
            members: [{ key: "missing", selection: "undeclared", prompt: "missing" }],
            concurrency: 1,
            join: { _tag: "AllSuccess" },
            remainder: "await",
          })
          .pipe(Effect.flip)
        expect(missing).toBeInstanceOf(Errors.ChildSelectionMissing)
        expect(yield* runtime.inspectTree(parent.runId)).toEqual(beforeMissing)
        const first = yield* claims.claimReadyRuns({ workerId: "fan-out", limit: 3 })
        expect(first.map((claim) => claim.run.runId)).toEqual([receipt.childRunIds[0]])
        yield* claims.commitWithClaim({
          runId: first[0]!.run.runId,
          workerId: "fan-out",
          attemptFence: first[0]!.attemptFence,
          transition: "complete",
          result: completedResult("first"),
        })
        const second = yield* claims.claimReadyRuns({ workerId: "fan-out", limit: 3 })
        expect(second.map((claim) => claim.run.runId)).toEqual([receipt.childRunIds[1]])
      }).pipe(scopedWith(postgresLayer(url))),
    ),
  )

  it.live("settles a parked Program completion through the canonical fan-out path", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const claims = yield* RunClaims.RunClaims
        const parent = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("program-fan-out-completion"),
          idempotencyKey: "parent",
          prompt: "parent",
        })
        const [parentClaim] = yield* claims.claimReadyRuns({ workerId: "program-parent", limit: 1 })
        const fanOut = yield* runtime.fanOut({
          parentRunId: parent.runId,
          idempotencyKey: "reviews",
          members: [{ key: "review", selection: "researcher", prompt: "review" }],
          concurrency: 1,
          join: { _tag: "AllSuccess" },
          remainder: "await",
        })
        yield* store.completeProgram({
          runId: parent.runId,
          ownerId: parentClaim!.workerId,
          attemptFence: parentClaim!.attemptFence,
          output: "program-output",
          outputBytes: 14,
          outputLimit: 100,
        })
        expect((yield* runtime.inspect(parent.runId)).status).toBe("waiting")
        expect(
          yield* runtime.steer({ runId: parent.runId, idempotencyKey: "late", prompt: "late" }).pipe(Effect.flip),
        ).toBeInstanceOf(Errors.RunTerminal)
        const [childClaim] = yield* claims.claimReadyRuns({ workerId: "program-child", limit: 1 })
        expect(childClaim?.run.runId).toBe(fanOut.childRunIds[0])
        yield* claims.commitWithClaim({
          runId: childClaim!.run.runId,
          workerId: childClaim!.workerId,
          attemptFence: childClaim!.attemptFence,
          transition: "complete",
          result: completedResult("reviewed"),
        })
        expect((yield* runtime.inspect(parent.runId)).status).toBe("succeeded")
        expect((yield* runtime.history({ runId: parent.runId, limit: 100 })).at(-1)).toMatchObject({
          _tag: "RunCompleted",
          result: { _tag: "Program", value: "program-output" },
        })
      }).pipe(scopedWith(postgresLayer(url))),
    ),
  )

  it.live("rejects fan-out from a terminal parent", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const claims = yield* RunClaims.RunClaims
        const parent = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("terminal-parent-fan-out"),
          idempotencyKey: "parent",
          prompt: "parent",
        })
        const [claim] = yield* claims.claimReadyRuns({ workerId: "parent", limit: 1 })
        yield* claims.commitWithClaim({
          runId: parent.runId,
          workerId: "parent",
          attemptFence: claim!.attemptFence,
          transition: "complete",
          result: completedResult("done"),
        })
        const failure = yield* runtime
          .fanOut({
            parentRunId: parent.runId,
            idempotencyKey: "late",
            members: [{ key: "late", selection: "researcher", prompt: "late" }],
            concurrency: 1,
            join: { _tag: "AllSuccess" },
            remainder: "await",
          })
          .pipe(Effect.flip)
        expect(failure).toBeInstanceOf(Errors.RunTerminal)
      }).pipe(scopedWith(postgresLayer(url))),
    ),
  )

  it.live("cursor replay on a second runtime node matches history", () =>
    withSchema(
      Effect.gen(function* () {
        const sessionId = uniqueSession("replay")
        const runId = yield* Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const claims = yield* RunClaims.RunClaims
          const receipt = yield* runtime.send({
            to: assistantAddress,
            sessionId,
            idempotencyKey: "replay",
            prompt: textPrompt("replay"),
          })
          const claimed = yield* claims.claimReadyRuns({ workerId: "n1", limit: 1, lease: "10 seconds" })
          yield* claims.commitWithClaim({
            runId: receipt.runId,
            workerId: "n1",
            attemptFence: claimed[0]!.attemptFence,
            transition: "complete",
            result: completedResult("ok"),
          })
          return receipt.runId
        }).pipe(scopedWith(postgresLayer(url)))

        const tagsA = yield* Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          return yield* runtime.events({ runId, cursor: -1 }).pipe(
            Stream.take(3),
            Stream.runCollect,
            Effect.map((chunk) => [...chunk].map((event) => `${event.sequence}:${event._tag}`)),
          )
        }).pipe(scopedWith(postgresLayer(url)))

        const tagsB = yield* Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          return yield* runtime.events({ runId, cursor: -1 }).pipe(
            Stream.take(3),
            Stream.runCollect,
            Effect.map((chunk) => [...chunk].map((event) => `${event.sequence}:${event._tag}`)),
          )
        }).pipe(scopedWith(postgresLayer(url)))

        expect(tagsA).toEqual(tagsB)
        expect(tagsA[0]).toBe("0:RunAccepted")
      }),
    ),
  )

  it.live("rejects malformed and cross-closure persisted event references with RuntimeUnavailable", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const malformed = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("malformed-event-ref"),
          idempotencyKey: "malformed",
          prompt: textPrompt("malformed"),
        })
        const crossClosure = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("cross-closure-event-ref"),
          idempotencyKey: "cross-closure",
          prompt: textPrompt("cross-closure"),
        })

        yield* corruptEventExecutableRef(malformed.runId, {})
        const historyError = yield* runtime.history({ runId: malformed.runId, cursor: -1, limit: 10 }).pipe(Effect.flip)
        expect(historyError).toBeInstanceOf(Errors.RuntimeUnavailable)

        yield* corruptEventExecutableRef(crossClosure.runId, alternateAssistantRef.ref)
        const replayError = yield* runtime
          .events({ runId: crossClosure.runId, cursor: -1 })
          .pipe(Stream.runCollect, Effect.flip)
        expect(replayError).toBeInstanceOf(Errors.RuntimeUnavailable)
      }).pipe(scopedWith(postgresLayer(url))),
    ),
  )

  it.live("RunSchema plan check apply and typed verify failures", () =>
    withSchema(
      Effect.gen(function* () {
        const restoreMeta = Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql`
            UPDATE ${sql(SCHEMA_META_TABLE)}
            SET version = ${SCHEMA_VERSION}, checksum = ${schemaChecksum()}, dirty = FALSE
            WHERE id = 1
          `
        }).pipe(scopedWith(PgClient.layer({ url: Redacted.make(url) })))

        const planned = yield* RunSchema.plan("postgres-test").pipe(
          scopedWith(PgClient.layer({ url: Redacted.make(url) })),
        )
        expect(planned.required).toBe(SCHEMA_VERSION)
        expect(planned.upgradeRequired).toBe(false)
        yield* RunSchema.check("postgres-test").pipe(scopedWith(PgClient.layer({ url: Redacted.make(url) })))
        yield* markDirty()
        const dirty = yield* Effect.exit(scopedWith(postgresLayer(url))(Effect.void))
        expect(Exit.isFailure(dirty)).toBe(true)
        yield* restoreMeta
        yield* corruptChecksum()
        const mismatch = yield* Effect.exit(scopedWith(postgresLayer(url))(Effect.void))
        expect(Exit.isFailure(mismatch)).toBe(true)
        yield* restoreMeta
        yield* bumpSchemaVersion(SCHEMA_VERSION + 9)
        const future = yield* Effect.exit(scopedWith(postgresLayer(url))(Effect.void))
        expect(Exit.isFailure(future)).toBe(true)
        yield* restoreMeta
      }),
    ),
  )
})

if (!postgresAvailable) {
  it.skip("postgres suite skipped: set BATON_DATABASE_URL or DATABASE_URL", () => undefined)
}
