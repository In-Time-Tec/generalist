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

  it.effect("zero, negative, non-finite, and unparsable timeouts fail typed", () =>
    Effect.gen(function* () {
      expectInvalid(yield* awaitInvalid("0 millis"))
      expectInvalid(yield* awaitInvalid("-1 seconds"))
      expectInvalid(yield* awaitInvalid(Number.NaN))
      expectInvalid(yield* awaitInvalid(Number.POSITIVE_INFINITY))
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: Untrusted callers can pass unparsable strings at runtime even though `Duration.Input` excludes them; `awaitEvent` must refuse the value typed.
      expectInvalid(yield* awaitInvalid("not-a-duration" as Duration.Input))
    }),
  )

  it.effect("representable timeouts suspend through the await control defect", () =>
    Effect.gen(function* () {
      const normal = yield* awaitExit("1 second")
      expect(Exit.isFailure(normal)).toBe(true)
      if (Exit.isFailure(normal)) {
        const suspension = suspendedFromCause(normal.cause)
        expect(suspension?.token).toBe("wake-event-timeout:await-event")
        expect(suspension?.awaitEvent.deadline).toBe("1970-01-01T00:00:01.000Z")
      }

      const large = yield* awaitExit("8000000000000000 millis")
      expect(Exit.isFailure(large)).toBe(true)
      if (Exit.isFailure(large)) {
        expect(suspendedFromCause(large.cause)).toBeDefined()
      }
    }),
  )
})
