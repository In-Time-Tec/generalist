import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { Steering } from "../src/index"

const message = (prompt: string): Steering.Message => ({ prompt })
const prompts = (messages: ReadonlyArray<Steering.Message>) => messages.map((item) => item.prompt)

describe("Steering", () => {
  it.effect("defaults to all steering and one follow-up at a time", () =>
    Effect.gen(function* () {
      const steering = yield* Steering.Steering

      yield* steering.steer(message("steer one"))
      yield* steering.steer(message("steer two"))
      yield* steering.followUp(message("follow one"))
      yield* steering.followUp(message("follow two"))

      expect(prompts(yield* steering.takeSteering())).toEqual(["steer one", "steer two"])
      expect(yield* steering.takeSteering()).toEqual([])
      expect(prompts(yield* steering.takeFollowUp())).toEqual(["follow one"])
      expect(prompts(yield* steering.takeFollowUp())).toEqual(["follow two"])
      expect(yield* steering.takeFollowUp()).toEqual([])
    }).pipe(Effect.provide(Steering.layer())),
  )

  it.effect("honors explicit queue modes", () =>
    Effect.gen(function* () {
      const steering = yield* Steering.Steering

      yield* steering.steer(message("steer one"))
      yield* steering.steer(message("steer two"))
      yield* steering.followUp(message("follow one"))
      yield* steering.followUp(message("follow two"))

      expect(prompts(yield* steering.takeSteering())).toEqual(["steer one"])
      expect(prompts(yield* steering.takeSteering())).toEqual(["steer two"])
      expect(prompts(yield* steering.takeFollowUp())).toEqual(["follow one", "follow two"])
      expect(yield* steering.takeFollowUp()).toEqual([])
    }).pipe(Effect.provide(Steering.layer({ steering: { mode: "one-at-a-time" }, followUp: { mode: "all" } }))),
  )

  it.effect("fails bounded queues with a typed overflow error", () =>
    Effect.gen(function* () {
      const steering = yield* Steering.Steering

      yield* steering.steer(message("kept"))
      const error = yield* Effect.flip(steering.steer(message("rejected")))

      expect(error).toBeInstanceOf(Steering.SteeringQueueFull)
      expect(error.queue).toBe("steering")
      expect(prompts(yield* steering.takeSteering())).toEqual(["kept"])
    }).pipe(Effect.provide(Steering.layer({ steering: { capacity: 1, onFull: "fail" } }))),
  )

  it.effect("supports explicit bounded dropping policies", () =>
    Effect.gen(function* () {
      const steering = yield* Steering.Steering

      yield* steering.steer(message("oldest"))
      yield* steering.steer(message("kept"))
      yield* steering.steer(message("dropped newest"))
      yield* steering.followUp(message("dropped oldest"))
      yield* steering.followUp(message("kept one"))
      yield* steering.followUp(message("kept two"))

      expect(prompts(yield* steering.takeSteering())).toEqual(["oldest", "kept"])
      expect(prompts(yield* steering.takeFollowUp())).toEqual(["kept one", "kept two"])
    }).pipe(
      Effect.provide(
        Steering.layer({
          steering: { mode: "all", capacity: 2, onFull: "drop-newest" },
          followUp: { mode: "all", capacity: 2, onFull: "drop-oldest" },
        }),
      ),
    ),
  )

  it.effect("testLayer provides an exact implementation", () => {
    const recorded: Array<string> = []
    return Effect.gen(function* () {
      const steering = yield* Steering.Steering

      yield* steering.steer(message("steer"))
      yield* steering.followUp(message("follow"))
      expect(recorded).toEqual(["steer", "follow"])
      expect(prompts(yield* steering.takeSteering())).toEqual(["test steer"])
      expect(yield* steering.takeFollowUp()).toEqual([])
    }).pipe(
      Effect.provide(
        Steering.testLayer({
          steer: (item) => Effect.sync(() => recorded.push(String(item.prompt))),
          followUp: (item) => Effect.sync(() => recorded.push(String(item.prompt))),
          takeSteering: () => Effect.succeed([message("test steer")]),
          takeFollowUp: () => Effect.succeed([]),
        }),
      ),
    )
  })
})
