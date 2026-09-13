import { expect, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import { ActiveModelResponse } from "../../../../src/index.js"
import { make, writer } from "../../../../src/core/model/result/active-model-response-writer.js"

it.effect("preserves public reads without granting writer ownership to copied or supplied services", () =>
  Effect.gen(function* () {
    const owned = make()
    const readOnly = ActiveModelResponse.ActiveModelResponse.of({ snapshot: owned.snapshot })
    const snapshot = yield* Effect.flatMap(ActiveModelResponse.ActiveModelResponse, (service) => service.snapshot).pipe(
      Effect.provideService(ActiveModelResponse.ActiveModelResponse, readOnly),
    )
    expect(Option.isNone(snapshot)).toBe(true)
    expect(() => writer(readOnly)).toThrow("ActiveModelResponse must be constructed by the model runtime")
    expect(() => writer({ ...owned })).toThrow("ActiveModelResponse must be constructed by the model runtime")
    expect(writer(owned).begin).toBeTypeOf("function")
  }),
)
