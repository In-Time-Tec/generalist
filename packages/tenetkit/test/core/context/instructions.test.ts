import { describe, expect, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import { Instructions } from "../../../src/index"

const context: Instructions.RenderContext = { agentName: "agent", turn: 0 }

const source = (
  id: string,
  render: (context: Instructions.RenderContext) => Option.Option<string>,
): Instructions.Provider => ({ id, render: (input) => Effect.succeed(render(input)) })

describe("Instructions", () => {
  it.effect("renders every source once and joins non-empty results in order", () =>
    Effect.gen(function* () {
      const baseline = yield* Instructions.render(
        {
          providers: [
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

  it.effect("fromText contributes non-empty text", () =>
    Effect.gen(function* () {
      const full = yield* Instructions.render({ providers: [Instructions.fromText("base", "hello")] }, context)
      const empty = yield* Instructions.render({ providers: [Instructions.fromText("empty", "")] }, context)
      expect(full).toBe("hello")
      expect(empty).toBe("")
    }),
  )
})
