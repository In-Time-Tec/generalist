import { expect, it } from "@effect/vitest"
import { Effect, Exit, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { AdmissionExhausted } from "../../../../src/core/durable/driver/operation-outcome.js"
import { journalNoop, make as makeInterpreter } from "../../../../src/core/durable/driver/interpreter.js"
import { make as makeDriver } from "../../../../src/core/durable/loop-driver.js"
import { Exhausted, make as makeBudget } from "../../../../src/core/durable/run-budget.js"

const fields = { budget: "children", requested: 1, remaining: 0 } as const

for (const fixture of [
  { name: "known child admission rejection", failure: AdmissionExhausted.make(fields), deferred: true },
  { name: "ordinary budget failure", failure: Exhausted.make(fields), deferred: false },
  {
    name: "decoded budget failure without admission provenance",
    failure: AdmissionExhausted.make(fields).pipe(Schema.encodeSync(Exhausted), Schema.decodeSync(Exhausted)),
    deferred: false,
  },
]) {
  it.effect(`preserves never-replay safety for ${fixture.name}`, () =>
    Effect.gen(function* () {
      const driver = makeDriver({ logicalOperationId: "budget-safety", sessionId: "budget-safety" })
      const initial = yield* driver.initial({ prompt: Prompt.make("test"), budget: makeBudget({}) })
      let deferred = 0
      let completed = 0
      const interpreter = yield* makeInterpreter({
        driver,
        initial,
        journal: {
          ...journalNoop,
          onAdmissionExhausted: () =>
            Effect.sync(() => {
              deferred += 1
            }),
          onCompleted: () =>
            Effect.sync(() => {
              completed += 1
            }),
        },
      })
      const result = yield* interpreter
        .run(
          {
            kind: "tool",
            key: "non-repeatable-tool",
            input: {},
            replayPolicy: "never",
            success: Schema.String,
            failure: Exhausted,
          },
          Effect.fail(fixture.failure),
        )
        .pipe(Effect.exit)
      expect(Exit.isFailure(result)).toBe(true)
      expect(deferred).toBe(fixture.deferred ? 1 : 0)
      expect(completed).toBe(fixture.deferred ? 0 : 1)
      expect(yield* interpreter.recorded).toHaveLength(fixture.deferred ? 0 : 1)
    }),
  )
}
