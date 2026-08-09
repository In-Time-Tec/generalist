import { expect, layer } from "@effect/vitest"
import { Effect, Fiber, FileSystem } from "effect"
import { liveOptions, platform, runCell, withPool } from "./bun-harness.js"

const delayThenWrite = (marker: string): string =>
  `await new Promise((resolve) => setTimeout(resolve, 2000)); await Bun.write(${"`"}${marker}${"`"}, "landed"); "done"`

layer(platform, liveOptions)("Bun kernel cancellation", (it) => {
  /**
   * Cancelling a cell must stop the work, not merely stop waiting for it. A host that abandoned the
   * cell while it kept running would still let the cell's later side effects land, so this asserts
   * on a file the cell writes after its delay, and waits PAST that delay before looking: the file's
   * absence is only evidence once the cell would have written it had it survived.
   */
  it.effect("suppresses the side effect of a cell interrupted before it completes", () =>
    withPool({
      use: ({ pool, dataRoot }) =>
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem
          const marker = `${dataRoot}/cancellation-side-effect`
          const running = yield* Effect.forkChild(
            Effect.gen(function* () {
              const signal = yield* Effect.abortSignal
              return yield* runCell({ pool, sessionId: "s", cellId: "c1", signal, code: delayThenWrite(marker) })
            }).pipe(Effect.exit),
          )
          yield* Effect.sleep(250)
          yield* Fiber.interrupt(running)
          yield* Effect.sleep(4000)
          expect(yield* fileSystem.exists(marker)).toBe(false)
        }),
    }),
  )

  /** The same cell left to run proves the marker is reachable, so the cancellation case is not vacuous. */
  it.effect("writes the same marker when the cell is left to complete", () =>
    withPool({
      use: ({ pool, dataRoot }) =>
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem
          const marker = `${dataRoot}/completion-side-effect`
          const result = yield* runCell({ pool, sessionId: "s", cellId: "c1", code: delayThenWrite(marker) })
          expect(result.value).toBe("done")
          expect(yield* fileSystem.exists(marker)).toBe(true)
        }),
    }),
  )
})
