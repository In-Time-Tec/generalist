import { describe, expect, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import { Instructions } from "../../../src/index"

const context: Instructions.RenderContext = { agentName: "agent", turn: 0 }

const source = (
  id: string,
  render: (context: Instructions.RenderContext) => Option.Option<string>,
): Instructions.Source => ({ id, render: (input) => Effect.succeed(render(input)) })

describe("Instructions", () => {
  it.effect("renders every source once and joins non-empty results in order", () =>
    Effect.gen(function* () {
      const baseline = yield* Instructions.openEpoch(
        {
          sources: [
            source("base", () => Option.some("base")),
            source("empty", () => Option.none()),
            source("turn", (input) => Option.some(`turn:${input.turn}`)),
          ],
        },
        context,
      )
      expect(baseline).toBe("base\n\nturn:0")
    }),
  )

  it.effect("staticSource contributes non-empty text", () =>
    Effect.gen(function* () {
      const full = yield* Instructions.openEpoch({ sources: [Instructions.staticSource("base", "hello")] }, context)
      const empty = yield* Instructions.openEpoch({ sources: [Instructions.staticSource("empty", "")] }, context)
      expect(full).toBe("hello")
      expect(empty).toBe("")
    }),
  )
})
