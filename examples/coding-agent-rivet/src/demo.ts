import { BunRuntime } from "@effect/platform-bun"
import { Console, Effect, Schema } from "effect"
import { createClient } from "rivetkit/client"
import { key } from "./actor.js"
import { make as makeCommand } from "./command.js"
import { loadConfig } from "./config.js"
import { rivetFailure } from "./errors.js"
import { make } from "./registry.js"

const DemoResult = Schema.Struct({
  runId: Schema.String,
  status: Schema.Literal("succeeded"),
  children: Schema.Array(Schema.Struct({ runId: Schema.String, status: Schema.String })),
})

const main = Effect.gen(function* () {
  const config = yield* loadConfig
  const registry = yield* Effect.acquireRelease(
    Effect.sync(() => make(config)),
    (value) =>
      Effect.tryPromise({ try: () => value.shutdown(), catch: rivetFailure("registry shutdown") }).pipe(Effect.orDie),
  )
  yield* Effect.tryPromise({ try: () => registry.startAndWait(), catch: rivetFailure("registry startup") })
  const parsed = registry.parseConfig()
  if (parsed.endpoint === undefined) {
    return yield* rivetFailure("client configuration")("Rivet did not resolve a client endpoint")
  }
  const endpoint = parsed.endpoint
  const client = yield* Effect.acquireRelease(
    Effect.sync(() =>
      createClient<typeof registry>({
        endpoint,
        namespace: parsed.namespace,
        token: parsed.token,
        poolName: config.rivet.poolName,
        disableMetadataLookup: false,
      }),
    ),
    (value) =>
      Effect.tryPromise({ try: () => value.dispose(), catch: rivetFailure("client disposal") }).pipe(Effect.orDie),
  )
  const actor = client.codingAgent.getOrCreate(key(config), { poolName: config.rivet.poolName })
  const receipt = yield* Effect.tryPromise({
    try: () => actor.runtime.send(makeCommand(config)),
    catch: rivetFailure("admission"),
  })
  let inspection = yield* Effect.tryPromise({
    try: () => actor.runtime.inspect(receipt.runId),
    catch: rivetFailure("inspection"),
  })
  for (let attempt = 0; attempt < 120 && !["succeeded", "failed", "cancelled"].includes(inspection.status); attempt++) {
    yield* Effect.sleep("250 millis")
    inspection = yield* Effect.tryPromise({
      try: () => actor.runtime.inspect(receipt.runId),
      catch: rivetFailure("inspection"),
    })
  }
  if (inspection.status !== "succeeded") {
    return yield* rivetFailure("Run completion")(`Coding Run ended with status '${inspection.status}'`)
  }
  if (inspection.children.length !== 2 || inspection.children.some((child) => child.status !== "succeeded")) {
    return yield* rivetFailure("child completion")("Both specialists must complete successfully")
  }
  const output = yield* Schema.encodeEffect(Schema.fromJsonString(DemoResult))({
    runId: receipt.runId,
    status: inspection.status,
    children: inspection.children.map((child) => ({ runId: child.childRunId, status: child.status })),
  })
  yield* Console.log(output)
  yield* Console.log("The coding family is stored. Press Ctrl-C to stop this host; its accepted work remains in S3.")
  return yield* Effect.never
}).pipe(Effect.scoped)

BunRuntime.runMain(main)
