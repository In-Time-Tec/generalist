import { Console, Effect, ManagedRuntime, Stream } from "effect"
import { RunClaims, Runtime } from "../src/index.js"
import { assistantAddress, completedResult } from "../test/helpers.js"
import { mysqlLayer, mysqlUrl, prepareMysql, uniqueSession } from "../test/mysql/helpers.js"

const url = mysqlUrl
if (url === undefined || url.length === 0) {
  throw new Error("Set BATON_MYSQL_URL or MYSQL_URL to run the MySQL tracer")
}

const encodeJson = (value: unknown): string => JSON.stringify(value)

const runTrace = (databaseUrl: string, sessionId: string) =>
  Effect.gen(function* () {
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
      url: databaseUrl.replace(/:[^:@/]+@/, ":***@"),
      runId: receipt.runId,
      attemptFence: claimed[0]!.attemptFence,
      tags,
      multiWorker: true,
    }
  })
const program = Effect.gen(function* () {
  yield* prepareMysql(url)
  const sessionId = uniqueSession("cli")
  const result = yield* runTrace(url, sessionId)
  yield* Console.log(encodeJson(result))
})

const runtime = ManagedRuntime.make(mysqlLayer(url))
await runtime.runPromise(program.pipe(Effect.scoped))
