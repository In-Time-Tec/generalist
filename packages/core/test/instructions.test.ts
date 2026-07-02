import { describe, expect, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import { Instructions } from "../src/index"

const context: Instructions.RenderContext = { agentName: "agent", turn: 0 }

const source = (
  id: string,
  cache: Instructions.ContextSource["cache"],
  render: (context: Instructions.RenderContext) => Option.Option<string>,
): Instructions.ContextSource => ({ id, cache, render: (input) => Effect.succeed(render(input)) })

describe("Instructions", () => {
  it.effect("opens an epoch by joining baseline sources in order", () =>
    Effect.gen(function* () {
      const dynamic = source("dynamic", "dynamic", () => Option.some("dynamic"))
      const epoch = yield* Instructions.openEpoch(
        {
          sources: [
            source("base", "baseline", () => Option.some("base")),
            source("empty", "baseline", () => Option.none()),
            dynamic,
            source("tail", "baseline", () => Option.some("tail")),
          ],
        },
        context,
      )

      expect(epoch.baseline).toBe("base\n\ntail")
      expect(epoch.dynamic.map((item) => item.id)).toEqual(["dynamic"])
    }),
  )

  it.effect("renders dynamic updates only", () =>
    Effect.gen(function* () {
      const update = yield* Instructions.renderUpdate(
        {
          baseline: "ignored",
          dynamic: [
            source("one", "dynamic", () => Option.some("one")),
            source("empty", "dynamic", () => Option.none()),
            source("two", "dynamic", () => Option.some("two")),
          ],
        },
        { agentName: "agent", turn: 1 },
      )

      expect(Option.getOrUndefined(update)).toBe("one\n\ntwo")
    }),
  )

  it.effect("returns none when dynamic sources do not render text", () =>
    Effect.gen(function* () {
      const empty = yield* Instructions.renderUpdate({ baseline: "base", dynamic: [] }, context)
      const allNone = yield* Instructions.renderUpdate(
        { baseline: "base", dynamic: [source("none", "dynamic", () => Option.none())] },
        context,
      )

      expect(Option.isNone(empty)).toBe(true)
      expect(Option.isNone(allNone)).toBe(true)
    }),
  )

  it.effect("renders dynamic sources with the requested render context", () =>
    Effect.gen(function* () {
      const update = yield* Instructions.renderUpdate(
        {
          baseline: "base",
          dynamic: [source("turn", "dynamic", (input) => Option.some(`turn:${input.turn}`))],
        },
        { agentName: "agent", turn: 3 },
      )

      expect(Option.getOrUndefined(update)).toBe("turn:3")
    }),
  )

  it.effect("staticSource contributes a non-empty baseline source", () =>
    Effect.gen(function* () {
      const full = yield* Instructions.openEpoch({ sources: [Instructions.staticSource("base", "hello")] }, context)
      const empty = yield* Instructions.openEpoch({ sources: [Instructions.staticSource("empty", "")] }, context)

      expect(full.baseline).toBe("hello")
      expect(empty.baseline).toBe("")
    }),
  )
})
