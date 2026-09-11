/* oxlint-disable effecttsgo/strict-effect-provide -- Each test provides its ToolContext test host at the test boundary. */
import { describe, expect, it } from "@effect/vitest"
import { Duration, Effect, Exit } from "effect"
import { Agent, ToolContext } from "../../../../src/index.js"
import { suspendedFromCause } from "../../../../src/core/agent/tools/wake-event.js"

const layer = ToolContext.layerTest({
  signal: new AbortController().signal,
  emit: () => Effect.succeed(true),
  sessionId: "wake-event-timeout",
})

const awaitInvalid = (timeout: Duration.Input) =>
  Agent.awaitEvent({ _tag: "Webhook", source: "github" }, { timeout }).pipe(Effect.provide(layer), Effect.flip)

const awaitExit = (timeout: Duration.Input) =>
  Agent.awaitEvent({ _tag: "Webhook", source: "github" }, { timeout }).pipe(Effect.provide(layer), Effect.exit)

const expectInvalid = (error: Agent.AwaitEventInvalid): void => {
  expect(error._tag).toBe("generalist/core/AwaitEventInvalid")
  expect(error.reason).toBe("invalid-timeout")
}

describe("Agent.awaitEvent timeout boundary", () => {
  it.effect("finite positive timeouts beyond the representable range fail typed instead of dying", () =>
    Effect.gen(function* () {
      expectInvalid(yield* awaitInvalid("9007199254740991 millis"))
      expectInvalid(yield* awaitInvalid("9007199254740992 millis"))
    }),
  )

  it.effect("zero, negative, and unparsable timeouts fail typed", () =>
    Effect.gen(function* () {
      expectInvalid(yield* awaitInvalid("0 millis"))
      expectInvalid(yield* awaitInvalid("-1 seconds"))
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: Untrusted callers can pass unparsable strings at runtime even though `Duration.Input` excludes them; `awaitEvent` must refuse the value typed.
      expectInvalid(yield* awaitInvalid("not-a-duration" as Duration.Input))
    }),
  )

  it.effect("representable timeouts suspend through the await control defect", () =>
    Effect.gen(function* () {
      for (const timeout of ["1 second", "8000000000000000 millis"] as const) {
        const exit = yield* awaitExit(timeout)
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) {
          expect(suspendedFromCause(exit.cause)).toBeDefined()
        }
      }
    }),
  )
})
