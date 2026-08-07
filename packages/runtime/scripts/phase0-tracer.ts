import { Console, Effect, Schema } from "effect"
import { Runtime, RunStore } from "../src/index.js"
import { assistantAddress, textPrompt } from "../test/helpers.js"
import { sqliteLayer, tempDbPath } from "../test/sqlite-helpers.js"

const encodeJson = (value: unknown): string => Schema.encodeSync(Schema.UnknownFromJsonString)(value)

const program = Effect.gen(function* () {
  const filename = tempDbPath("phase0-cli")
  let externalCounter = 0
  const boundary = yield* Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const driver = yield* RunStore.RunStore
    const receipt = yield* runtime.send({
      to: assistantAddress,
      sessionId: "session:phase0",
      idempotencyKey: "phase0",
      prompt: textPrompt("phase0"),
    })
    const claim = yield* driver.claimExecution({ runId: receipt.runId, ownerId: "tracer" })
    const op = yield* driver.recordOperation({
      ...claim,
      operationKey: "tool:counter",
      kind: "tool",
      inputDigest: "phase0",
      input: { n: 1 },
      replayPolicy: "never",
      attempt: 1,
    })
    yield* driver.startOperation({ ...claim, operationId: op.operationId })
    externalCounter += 1
    return { runId: receipt.runId, operationId: op.operationId }
  }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)

  const unknown = yield* Effect.gen(function* () {
    const driver = yield* RunStore.RunStore
    const claim = yield* driver.claimExecution({ runId: boundary.runId, ownerId: "tracer-recovery" })
    return yield* driver.expireRunningOperation({ ...claim, operationId: boundary.operationId })
  }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)

  yield* Console.log(
    encodeJson({
      filename,
      externalCounter,
      outcome: unknown.outcome,
      status: unknown.record.status,
      blindRepeat: false,
    }),
  )
})

await Effect.runPromise(program)
