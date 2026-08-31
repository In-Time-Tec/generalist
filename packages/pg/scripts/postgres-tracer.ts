import { Console, Effect, ManagedRuntime, Schema } from "effect"
import { Runtime } from "generalist/runtime"
import { RunClaims } from "generalist/runtime/sql-driver"
import { assistantAddress, completedResult, textPrompt } from "../../generalist/test/runtime/execution/fixtures.js"
import { postgresAvailable, postgresDatabase, postgresLayer, uniqueSession } from "../test/postgres/database.js"

if (!postgresAvailable) {
  throw new Error("Set GENERALIST_DATABASE_URL or DATABASE_URL to run the postgres tracer")
}

const database = postgresDatabase("cli-tracer")
const url = database.url

const encodeJson = (value: Schema.Json): string => JSON.stringify(value)

const runTrace = (databaseUrl: string, sessionId: string) =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const claims = yield* RunClaims
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
      session: claimed[0]!.session,
      transition: "complete",
      result: completedResult("ok"),
    })
    const tags = (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 3 })).map((event) => event._tag)
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
  yield* Console.log(encodeJson(result))
})

const runtime = ManagedRuntime.make(database.provision(postgresLayer(url)))
await runtime.runPromise(program.pipe(Effect.scoped))
