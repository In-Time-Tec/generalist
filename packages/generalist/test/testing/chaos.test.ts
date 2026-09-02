import { expect, it } from "@effect/vitest"
import { Cause, Effect, Exit, Layer } from "effect"
import { LanguageModel } from "effect/unstable/ai"
import { Testing } from "generalist/testing"
import { JournalFault } from "../../src/runtime/operation/journal-fault.js"
import { ConnectionFault } from "../../src/transport/connection-fault.js"

it.effect("interruptAfter interrupts exactly at the declared journaled operation", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const context = yield* Layer.build(Testing.chaos.interruptAfter(3))
      const fault = yield* JournalFault.pipe(Effect.provide(context))
      expect(yield* Effect.exit(fault.afterJournaledOperation)).toEqual(Exit.succeed(undefined))
      expect(yield* Effect.exit(fault.afterJournaledOperation)).toEqual(Exit.succeed(undefined))
      const third = yield* Effect.exit(fault.afterJournaledOperation)
      expect(Exit.isFailure(third) && Cause.hasInterrupts(third.cause)).toBe(true)
    }),
  ),
)

it.effect("dropConnection fails exactly after the declared admitted event", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const context = yield* Layer.build(Testing.chaos.dropConnection(2))
      const fault = yield* ConnectionFault.pipe(Effect.provide(context))
      expect(yield* Effect.exit(fault.afterEvent)).toEqual(Exit.succeed(undefined))
      const second = yield* Effect.flip(fault.afterEvent)
      expect(second).toMatchObject({ kind: "socket", message: "chaos connection drop after 2 events" })
    }),
  ),
)

it.effect("flakyModel fails every declared request", () =>
  Effect.scoped(
    Layer.build(Testing.chaos.flakyModel({ failEvery: 3 })).pipe(
      Effect.flatMap((context) =>
        Effect.gen(function* () {
          expect((yield* LanguageModel.generateText({ prompt: "first" })).text).toBe("deterministic response")
          expect((yield* LanguageModel.generateText({ prompt: "second" })).text).toBe("deterministic response")
          const third = yield* LanguageModel.generateText({ prompt: "third" }).pipe(Effect.flip)
          expect(third.reason._tag).toBe("InternalProviderError")
          expect((yield* LanguageModel.generateText({ prompt: "fourth" })).text).toBe("deterministic response")
        }).pipe(Effect.provideContext(context)),
      ),
    ),
  ),
)
