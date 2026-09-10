import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { Agent } from "generalist"
import { layer, text } from "generalist/testing/model"

it.effect("returns the answer supplied by the model", () =>
  Effect.gen(function* () {
    const coder = Agent.make({ name: "coding-agent" })
    const answer = yield* Agent.run(coder, "Why does average([]) return NaN?").pipe(
      Effect.provide(layer([text("Return 0 before dividing when values.length is 0.")])),
    )
    expect(answer).toBe("Return 0 before dividing when values.length is 0.")
  }),
)
