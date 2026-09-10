import { BunRuntime } from "@effect/platform-bun"
import { Console, Effect } from "effect"
import { loadConfig } from "./config.js"
import { rivetFailure } from "./errors.js"
import { make } from "./registry.js"

const main = Effect.gen(function* () {
  const config = yield* loadConfig
  const registry = yield* Effect.acquireRelease(
    Effect.sync(() => make(config)),
    (value) =>
      Effect.tryPromise({ try: () => value.shutdown(), catch: rivetFailure("registry shutdown") }).pipe(Effect.orDie),
  )
  yield* Effect.tryPromise({ try: () => registry.startAndWait(), catch: rivetFailure("registry startup") })
  yield* Console.log("coding-agent-rivet host registered")
  return yield* Effect.never
}).pipe(Effect.scoped)

BunRuntime.runMain(main)
