import { Console, Effect, Schema, Stream } from "effect"
import { RunClaims, Runtime } from "../src/index.js"
import { assistantAddress, completedResult } from "../test/helpers.js"
import { mysqlLayer, mysqlUrl, prepareMysql, uniqueSession } from "../test/mysql/helpers.js"

class TracerMissingEnvironment extends Schema.TaggedErrorClass<TracerMissingEnvironment>()(
  "@batonfx/runtime/TracerMissingEnvironment",
  { name: Schema.String },
) {}

const url = mysqlUrl

const encodeJson = (value: unknown): string => Schema.encodeSync(Schema.UnknownFromJsonString)(value)

const program = Effect.gen(function* () {
  if (url === undefined || url.length === 0) {
    yield* Effect.logError("Set BATON_MYSQL_URL or MYSQL_URL to run the MySQL tracer")
    return yield* TracerMissingEnvironment.make({ name: "BATON_MYSQL_URL" })
  }
  yield* prepareMysql(url)
  const sessionId = uniqueSession("cli")
  const result = yield* Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const claims = yield* RunClaims.RunClaims
    const receipt = yield* runtime.send({
      to: assistantAddress,
      sessionId,
      idempotencyKey: "mysql-tracer",
      prompt: "mysql-tracer",
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
    const tags = yield* runtime.events({ runId: receipt.runId, cursor: -1 }).pipe(
      Stream.take(3),
      Stream.runCollect,
      Effect.map((chunk) => [...chunk].map((event) => event._tag)),
    )
    return {
      url: url.replace(/:[^:@/]+@/, ":***@"),
      runId: receipt.runId,
      attemptFence: claimed[0]!.attemptFence,
      tags,
      multiWorker: true,
    }
  }).pipe(Effect.provide(mysqlLayer(url)), Effect.scoped)
  yield* Console.log(encodeJson(result))
})

await Effect.runPromise(program)
