import { Console, Effect, ManagedRuntime, Schema, Stream } from "effect"
import { Runtime } from "tenetkit/runtime"
import { RunClaims } from "tenetkit/runtime/driver/sql/run/claims"
import { assistantAddress, completedResult } from "../../tenetkit/test/runtime/execution/fixtures.js"
import { mysqlAvailable, mysqlDatabase, mysqlLayer, uniqueSession } from "../test/mysql/runtime/environment.js"

if (!mysqlAvailable) {
  throw new Error("Set TENETKIT_MYSQL_URL or MYSQL_URL to run the MySQL tracer")
}

const database = mysqlDatabase("cli-tracer")
const url = database.url

const runTrace = (databaseUrl: string, sessionId: string) =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const claims = yield* RunClaims
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
      url: databaseUrl.replace(/:[^:@/]+@/, ":***@"),
      runId: receipt.runId,
      attemptFence: claimed[0]!.attemptFence,
      tags,
      multiWorker: true,
    }
  })
const program = Effect.gen(function* () {
  const sessionId = uniqueSession("cli")
  const result = yield* runTrace(url, sessionId)
  const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(result)
  yield* Console.log(encoded)
})

const runtime = ManagedRuntime.make(database.provision(mysqlLayer(url)))
await runtime.runPromise(program.pipe(Effect.scoped))
