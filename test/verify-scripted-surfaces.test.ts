import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Option, Ref } from "effect"
import { TestClock } from "effect/testing"
import { observeServer, waitForOutput } from "../scripts/verify-scripted-surfaces.js"

describe("verify scripted surfaces", () => {
  it.live("rejects a log-only server with no listening endpoint", () =>
    Effect.gen(function* () {
      const output = yield* Ref.make("legacy MCP 2025-06-18 server listening on port 4321")
      const exit = yield* observeServer(
        Effect.all([waitForOutput(output, /legacy MCP 2025-06-18 server listening on port 4321/), Effect.never]),
        Effect.never,
      ).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
    }),
  )

  it.effect("reports a ready server that exits within its observation window", () =>
    Effect.gen(function* () {
      const exit = yield* observeServer(Effect.void, Effect.succeed(0))
      expect(Option.isSome(exit) && exit.value).toBe(0)
    }),
  )

  it.effect("observes readiness and liveness in the same three-second window", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const observation = yield* observeServer(Effect.sleep("2 seconds"), Effect.never).pipe(Effect.forkScoped)
        yield* TestClock.adjust("3 seconds")
        const exit = yield* Effect.sync(() => observation.pollUnsafe())
        expect(exit).toBeDefined()
        if (exit !== undefined) {
          expect(Exit.isSuccess(exit) && Option.isNone(exit.value)).toBe(true)
        }
      }),
    ),
  )
})
