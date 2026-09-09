import { register as registerBranches } from "./branch-suite.js"
import "./domain-model-suite.js"
import { BunCrypto } from "@effect/platform-bun"
/* oxlint-disable effecttsgo/strict-effect-provide -- Each durability test owns its scoped BunCrypto test-host Layer. */
import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber, Layer, Option, Schema } from "effect"
import { FrameworkFailure } from "../../../src/core/tools/tool-executor.js"
import { Prompt } from "effect/unstable/ai"
import { ObjectStore } from "../../../src/durability/object-store.js"
import { activate, layerRunStore } from "../../../src/durability/index.js"
import { RunStore } from "../../../src/runtime/run/store.js"
import { sequenceName } from "../../../src/durability/internal/protocol.js"
import { makeRunStore } from "../../../src/runtime/state/store.js"
import { Address } from "../../../src/runtime/address.js"
import { Cursor } from "../../../src/runtime/cursor.js"
import { makeTest } from "../../../src/runtime/executable/manifest.js"
import { make as makeSimulator, type Client } from "../../../src/testing/durability/index.js"
import { registrationsFor } from "../../runtime/execution/fixtures.js"
import { provideScoped } from "../../runtime/execution/scoped-provide.js"

registerBranches({ makeRunStore, makeTest })

const executable = makeTest("durable-runtime", "1")
const address = Address.make("agent:durable-runtime")
const options = {
  environment: "test",
  tenant: "runtime",
  partition: "shared",
  addresses: [{ address, executable, registrations: registrationsFor(executable) }],
}
const slot = (sequence: string) =>
  `environments/test/v1/tenants/runtime/partitions/shared/commits/${sequenceName(sequence)}.json`
const open = (client: Client) => makeRunStore(options).pipe(Effect.provideService(ObjectStore, client.store))
const openActive = (client: Client, workerId: string) =>
  Effect.gen(function* () {
    const context = yield* Layer.build(
      layerRunStore({ ...options, workerId }).pipe(Layer.provide(Layer.succeed(ObjectStore, client.store))),
    )
    yield* activate.pipe(Effect.provide(context))
    return yield* RunStore.pipe(Effect.provide(context))
  })
const admission = (key: string) => ({
  message: {
    id: `message:${key}`,
    to: address,
    sessionId: `session:${key}`,
    prompt: Prompt.make("recover the exact accepted work"),
    idempotencyKey: key,
    correlationId: `correlation:${key}`,
    metadata: {},
  },
  executableRef: executable.ref,
  executableManifest: executable.manifest,
  registrations: [],
})

/** INV-02/03/06/07/08/09: real RunStore commands over the production journal, not a parallel reducer. */
describe("object Runtime canonical mutations", () => {
  it.effect("retains an encoded driver framework failure across a fresh store", () =>
    provideScoped(
      BunCrypto.layer,
      Effect.gen(function* () {
        const bucket = yield* makeSimulator()
        const failure = FrameworkFailure.make({
          stage: "handler",
          tool: "read",
          message: "Tool admission capacity exhausted",
        })
        const encoded = yield* Schema.encodeEffect(FrameworkFailure)(failure)
        const completed = yield* Effect.scoped(
          Effect.gen(function* () {
            const store = yield* openActive(bucket, "failure-writer")
            const run = yield* store.admitSend(admission("encoded-framework-failure"))
            const claim = yield* store.claimExecution({
              runId: run.runId,
              ownerId: "failure-writer",
              commandId: "claim-failure",
            })
            const operation = yield* store.recordOperation({
              ...claim,
              operationKey: "failed-tool",
              kind: "tool",
              inputDigest: "failed-input",
              input: {},
              replayPolicy: "never",
              attempt: 1,
            })
            yield* store.startOperation({ ...claim, operationId: operation.operationId, commandId: "start-failure" })
            const record = yield* store.completeOperation({
              ...claim,
              operationId: operation.operationId,
              outcome: { _tag: "Failed", error: encoded },
            })
            expect(record.status).toBe("failed")
            return { runId: run.runId, operationId: operation.operationId }
          }),
        )
        yield* Effect.scoped(
          Effect.gen(function* () {
            const store = yield* open(yield* bucket.connect)
            const recovered = yield* store.getOperation(completed)
            expect(recovered.status).toBe("failed")
            expect(recovered.error).toBeInstanceOf(FrameworkFailure)
            expect(recovered.error).toEqual(failure)
          }),
        )
      }),
    ).pipe(Effect.scoped),
  )

  it.effect("reads scalar admission presence through fresh canonical authority", () =>
    provideScoped(
      BunCrypto.layer,
      Effect.gen(function* () {
        const bucket = yield* makeSimulator()
        const writer = yield* open(bucket)
        const reader = yield* open(yield* bucket.connect)
        const query = { address, sessionId: "session:presence", idempotencyKey: "presence" }
        expect(yield* reader.hasAdmission(query)).toBe(false)
        yield* writer.admitSend(admission("presence"))
        expect(yield* reader.hasAdmission(query)).toBe(true)
        expect(yield* reader.hasAdmission({ ...query, sessionId: "other" })).toBe(false)
        expect(yield* reader.hasAdmission({ ...query, idempotencyKey: "other" })).toBe(false)
        const fresh = yield* open(yield* bucket.connect)
        expect(yield* fresh.hasAdmission(query)).toBe(true)
        yield* bucket.maintenance.remove(slot("0"))
        yield* bucket.store.create(slot("0"), new TextEncoder().encode("{}"))
        expect(yield* reader.hasAdmission(query).pipe(Effect.flip)).toMatchObject({ reason: "corruption" })
      }),
    ).pipe(Effect.scoped),
  )

  it.effect("rejects scalar admission reads after their store scope closes", () =>
    provideScoped(
      BunCrypto.layer,
      Effect.gen(function* () {
        const bucket = yield* makeSimulator()
        const store = yield* Effect.scoped(open(bucket))
        const error = yield* store
          .hasAdmission({ address, sessionId: "session:closed", idempotencyKey: "closed" })
          .pipe(Effect.flip)
        expect(error._tag).toBe("generalist/runtime/RuntimeUnavailable")
      }),
    ).pipe(Effect.scoped),
  )

  it.effect("reconciles a reward's void receipt after restart without duplicating the event", () =>
    provideScoped(
      BunCrypto.layer,
      Effect.gen(function* () {
        const bucket = yield* makeSimulator()
        const first = yield* open(bucket)
        const run = yield* first.admitSend(admission("reward"))
        const command = { commandId: "reward-1", runId: run.runId, leaf: "leaf-1", value: 1, source: "test" }
        yield* bucket.faults.failNextCreate({ key: slot("1"), phase: "after" })
        yield* bucket.faults.failNextRead({ key: slot("1") })
        expect(yield* first.recordReward(command).pipe(Effect.flip)).toMatchObject({ reason: "indeterminate" })
        const recovered = yield* open(yield* bucket.connect)
        expect(yield* recovered.recordReward(command)).toBeUndefined()
        const history = yield* recovered.history({ runId: run.runId, cursor: Cursor.make(-1), limit: 100 })
        expect(history.filter((event) => event._tag === "Rewarded")).toHaveLength(1)
        expect(yield* recovered.recordReward({ ...command, value: 2 }).pipe(Effect.flip)).toMatchObject({
          reason: "input-conflict",
        })
      }),
    ).pipe(Effect.scoped),
  )

  it.effect("recovers an admitted run and its host session on a fresh independent layer", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator({ pageSize: 1 })
      const admitted = yield* Effect.scoped(
        Effect.gen(function* () {
          const first = yield* open(bucket)
          yield* first.createHostSession({ id: "session:fresh", title: "retained" })
          return yield* first.admitSend(admission("fresh"))
        }),
      )
      const second = yield* open(yield* bucket.connect)
      expect(yield* second.hostSession("session:fresh")).toMatchObject({ id: "session:fresh", title: "retained" })
      expect(yield* second.inspect(admitted.runId)).toMatchObject({ runId: admitted.runId, status: "running" })
      const history = yield* second.history({ runId: admitted.runId, cursor: Cursor.make(-1), limit: 100 })
      expect(history.map((event) => event.sequence)).toEqual(history.map((_, index) => index))
      expect(yield* second.admitSend(admission("fresh"))).toEqual(admitted)
    }).pipe(Effect.scoped, Effect.provide(BunCrypto.layer)),
  )

  it.effect("racing fresh clients return one exact admission receipt", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const first = yield* open(bucket)
      const second = yield* open(yield* bucket.connect)
      const paused = yield* bucket.faults.pauseNextCreate(slot("0"))
      const pending = yield* first.admitSend(admission("race")).pipe(Effect.forkChild({ startImmediately: true }))
      yield* paused.entered
      const winner = yield* second.admitSend(admission("race"))
      yield* paused.release
      expect(yield* Fiber.join(pending)).toEqual(winner)
      expect((yield* first.list({ limit: 10 })).map((run) => run.runId)).toEqual([winner.runId])
      expect(yield* bucket.store.read(slot("1"), { maxBytes: 1024 * 1024 })).toBeUndefined()
    }).pipe(Effect.scoped, Effect.provide(BunCrypto.layer)),
  )

  it.effect("an indeterminate budget extension can be resubmitted after restart without double charging", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const first = yield* open(bucket)
      const run = yield* first.admitSend(admission("budget"))
      const command = { commandId: "budget-topup-1", runId: run.runId, delta: { tokens: 100 } }
      yield* bucket.faults.failNextCreate({ key: slot("1"), phase: "after" })
      yield* bucket.faults.failNextRead({ key: slot("1") })
      expect(yield* first.extendBudget(command).pipe(Effect.flip)).toMatchObject({ reason: "indeterminate" })
      const recovered = yield* open(yield* bucket.connect)
      yield* recovered.extendBudget(command)
      const history = yield* recovered.history({ runId: run.runId, cursor: Cursor.make(-1), limit: 100 })
      expect(history.filter((event) => event._tag === "BudgetExtended").map((event) => event.delta)).toEqual([
        { tokens: 100 },
      ])
      expect(yield* recovered.extendBudget({ ...command, delta: { tokens: 200 } }).pipe(Effect.flip)).toMatchObject({
        reason: "input-conflict",
      })
    }).pipe(Effect.scoped, Effect.provide(BunCrypto.layer)),
  )

  it.effect("session appends survive restart and stale run/session authority cannot write after transfer", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const first = yield* openActive(bucket, "owner-a")
      const run = yield* first.admitSend(admission("session"))
      const claim = yield* first.claimExecution({ runId: run.runId, ownerId: "owner-a", commandId: "claim-a" })
      const writer = Option.getOrThrow(yield* first.claimedSessionStore(claim))
      const entry = yield* writer.append(
        { _tag: "Message", message: Prompt.make("accepted").content[0]! },
        { id: "entry-1", expectedLeafId: null },
      )
      const second = yield* openActive(yield* bucket.connect, "owner-b")
      expect(
        yield* second
          .claimExecution({ runId: run.runId, ownerId: "owner-b", commandId: "claim-b-live" })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "generalist/runtime/RuntimeUnavailable" })
      yield* first.releaseExecution(claim)
      const replacement = yield* second.claimExecution({ runId: run.runId, ownerId: "owner-b", commandId: "claim-b" })
      expect(replacement.attemptFence).toBeGreaterThan(claim.attemptFence)
      expect(BigInt(replacement.session!.epoch)).toBeGreaterThan(BigInt(claim.session!.epoch))
      expect(
        yield* writer
          .append(
            { _tag: "Message", message: Prompt.make("stale").content[0]! },
            { id: "entry-stale", expectedLeafId: entry.id },
          )
          .pipe(Effect.flip),
      ).toMatchObject({ reason: "conflict" })
      const reader = Option.getOrThrow(yield* second.sessionReader("session:session"))
      expect(yield* reader.leaf).toBe(entry.id)
      expect((yield* reader.path()).map((item) => item.id)).toEqual([entry.id])
    }).pipe(Effect.scoped, Effect.provide(BunCrypto.layer)),
  )

  it.effect("replays one generated Session append by command identity and rejects a divergent retry", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const store = yield* openActive(bucket, "owner-append")
      const run = yield* store.admitSend(admission("append-replay"))
      const claim = yield* store.claimExecution({
        runId: run.runId,
        ownerId: "owner-append",
        commandId: "claim-append",
      })
      const writer = Option.getOrThrow(yield* store.claimedSessionStore(claim))
      const entry = { _tag: "Message" as const, message: Prompt.make("same logical write").content[0]! }
      const appendOptions = { commandId: "append-replay-1", expectedLeafId: null }
      const first = yield* writer.append(entry, appendOptions)
      expect(yield* writer.append(entry, appendOptions)).toEqual(first)
      const conflict = yield* Effect.flip(
        writer.append({ ...entry, message: Prompt.make("different logical write").content[0]! }, appendOptions),
      )
      expect(conflict).toMatchObject({
        _tag: "generalist/core/SessionStoreError",
        reason: "conflict",
        cause: { _tag: "generalist/durability/DurabilityFailure", reason: "input-conflict" },
      })
    }).pipe(Effect.scoped, Effect.provide(BunCrypto.layer)),
  )

  it.effect("fresh ownership preserves an uncertain never-replay operation as Unknown", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const first = yield* openActive(bucket, "owner-a")
      const run = yield* first.admitSend(admission("unknown"))
      const claim = yield* first.claimExecution({ runId: run.runId, ownerId: "owner-a", commandId: "claim-a" })
      const operation = yield* first.recordOperation({
        ...claim,
        operationKey: "external-payment",
        kind: "tool",
        inputDigest: "payment-input",
        input: { amount: 5 },
        replayPolicy: "never",
        attempt: 1,
      })
      yield* first.startOperation({ ...claim, operationId: operation.operationId, commandId: "dispatch-payment" })
      yield* first.releaseExecution(claim)
      const recovered = yield* openActive(yield* bucket.connect, "owner-b")
      const next = yield* recovered.claimExecution({ runId: run.runId, ownerId: "owner-b", commandId: "recover-claim" })
      expect(yield* recovered.recoverRunningOperations({ ...next, commandId: "recover-operations" })).toBe("blocked")
      expect(yield* recovered.getOperation({ runId: run.runId, operationId: operation.operationId })).toMatchObject({
        status: "unknown",
        replayPolicy: "never",
      })
      expect(yield* recovered.inspect(run.runId)).toMatchObject({ status: "needs-resolution" })
    }).pipe(Effect.scoped, Effect.provide(BunCrypto.layer)),
  )
})
