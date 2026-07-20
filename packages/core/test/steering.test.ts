import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { Steering } from "../src/index"
import { ItLayer } from "./it-layer"

const input = (prompt: string): Steering.Input => ({ prompt })
const prompts = (inputs: ReadonlyArray<Steering.Input>) => inputs.map((item) => item.prompt)

describe("Steering", () => {
  ItLayer.make(
    it,
    "defaults to all steering and one follow-up at a time",
    () =>
      [
        Steering.layer(),
        Effect.gen(function* () {
          const steering = yield* Steering.Steering

          yield* steering.steer(input("steer one"))
          yield* steering.steer(input("steer two"))
          yield* steering.followUp(input("follow one"))
          yield* steering.followUp(input("follow two"))

          expect(prompts(yield* steering.takeSteering)).toEqual(["steer one", "steer two"])
          expect(yield* steering.takeSteering).toEqual([])
          expect(prompts(yield* steering.takeFollowUp)).toEqual(["follow one"])
          expect(prompts(yield* steering.takeFollowUp)).toEqual(["follow two"])
          expect(yield* steering.takeFollowUp).toEqual([])
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "honors explicit queue modes",
    () =>
      [
        Steering.layer({ steering: { mode: "one-at-a-time" }, followUp: { mode: "all" } }),
        Effect.gen(function* () {
          const steering = yield* Steering.Steering

          yield* steering.steer(input("steer one"))
          yield* steering.steer(input("steer two"))
          yield* steering.followUp(input("follow one"))
          yield* steering.followUp(input("follow two"))

          expect(prompts(yield* steering.takeSteering)).toEqual(["steer one"])
          expect(prompts(yield* steering.takeSteering)).toEqual(["steer two"])
          expect(prompts(yield* steering.takeFollowUp)).toEqual(["follow one", "follow two"])
          expect(yield* steering.takeFollowUp).toEqual([])
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "fails bounded queues with a typed overflow error",
    () =>
      [
        Steering.layer({ steering: { capacity: 1, onFull: "fail" } }),
        Effect.gen(function* () {
          const steering = yield* Steering.Steering

          yield* steering.steer(input("kept"))
          const error = yield* Effect.flip(steering.steer(input("rejected")))

          expect(error).toBeInstanceOf(Steering.SteeringQueueFull)
          expect(error.queue).toBe("steering")
          expect(prompts(yield* steering.takeSteering)).toEqual(["kept"])
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "supports explicit bounded dropping policies",
    () =>
      [
        Steering.layer({
          steering: { mode: "all", capacity: 2, onFull: "drop-newest" },
          followUp: { mode: "all", capacity: 2, onFull: "drop-oldest" },
        }),
        Effect.gen(function* () {
          const steering = yield* Steering.Steering

          yield* steering.steer(input("oldest"))
          yield* steering.steer(input("kept"))
          yield* steering.steer(input("dropped newest"))
          yield* steering.followUp(input("dropped oldest"))
          yield* steering.followUp(input("kept one"))
          yield* steering.followUp(input("kept two"))

          expect(prompts(yield* steering.takeSteering)).toEqual(["oldest", "kept"])
          expect(prompts(yield* steering.takeFollowUp)).toEqual(["kept one", "kept two"])
        }),
      ] as const,
  )

  ItLayer.make(it, "testLayer provides an exact implementation", () => {
    const recorded: Array<string> = []
    return [
      Steering.testLayer({
        steer: (item) => Effect.sync(() => recorded.push(String(item.prompt))),
        followUp: (item) => Effect.sync(() => recorded.push(String(item.prompt))),
        takeSteering: Effect.succeed([input("test steer")]),
        takeFollowUp: Effect.succeed([]),
      }),
      Effect.gen(function* () {
        const steering = yield* Steering.Steering

        yield* steering.steer(input("steer"))
        yield* steering.followUp(input("follow"))
        expect(recorded).toEqual(["steer", "follow"])
        expect(prompts(yield* steering.takeSteering)).toEqual(["test steer"])
        expect(yield* steering.takeFollowUp).toEqual([])
      }),
    ] as const
  })
})
