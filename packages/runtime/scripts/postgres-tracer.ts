import { Console, Effect, Schema } from "effect"
import { RunClaims, Runtime } from "../src/index.js"
import { assistantAddress, completedResult, textPrompt } from "../test/helpers.js"
import { postgresLayer, postgresUrl, preparePostgres, uniqueSession } from "../test/postgres/helpers.js"

class TracerMissingEnvironment extends Schema.TaggedErrorClass<TracerMissingEnvironment>()(
  "@batonfx/runtime/TracerMissingEnvironment",
  { name: Schema.String },
) {}

const url = postgresUrl

const encodeJson = (value: unknown): string => Schema.encodeSync(Schema.UnknownFromJsonString)(value)

const program = Effect.gen(function* () {
  if (url === undefined || url.length === 0) {
    yield* Effect.logError("Set BATON_DATABASE_URL or DATABASE_URL to run the postgres tracer")
    return yield* TracerMissingEnvironment.make({ name: "BATON_DATABASE_URL" })
  }
  yield* preparePostgres(url)
  const sessionId = uniqueSession("cli")
  const result = yield* Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const claims = yield* RunClaims.RunClaims
    const receipt = yield* runtime.send({
      to: assistantAddress,
      sessionId,
      idempotencyKey: "postgres-tracer",
      prompt: textPrompt("postgres-tracer"),
    })
    const claimed = yield* claims.claimReadyRuns({
      workerId: "cli-worker",
      limit: 1,
      lease: "30 seconds",
    })
    yield* claims.commitWithClaim({
      runId: receipt.runId,
      workerId: "cli-worker",
      attemptFence: claimed[0]!.attemptFence,
      transition: "complete",
      result: completedResult("ok"),
    })
    const tags = (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 3 })).map((event) => event._tag)
    return {
      url: url.replace(/:[^:@/]+@/, ":***@"),
      runId: receipt.runId,
      attemptFence: claimed[0]!.attemptFence,
      tags,
      multiWorker: true,
    }
  }).pipe(Effect.provide(postgresLayer(url)), Effect.scoped)
  yield* Console.log(encodeJson(result))
})

await Effect.runPromise(program)
