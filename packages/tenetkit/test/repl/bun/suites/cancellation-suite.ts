import { expect, layer } from "@effect/vitest"
import { Effect, Fiber, FileSystem } from "effect"
import { liveOptions, platform, runCell, withPool } from "../../bun-harness.js"

const delayThenWrite = (marker: string): string =>
  `await new Promise((resolve) => setTimeout(resolve, 2000)); await Bun.write(\`${marker}\`, "landed"); "done"`

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
          const started = `${dataRoot}/cancellation-started`
          const first = yield* runCell({ pool, sessionId: "s", cellId: "c1", code: "process.pid" })
          const running = yield* Effect.forkChild(
            Effect.gen(function* () {
              const signal = yield* Effect.abortSignal
              return yield* runCell({
                pool,
                sessionId: "s",
                cellId: "c2",
                signal,
                code: `await Bun.write(\`${started}\`, "started"); ${delayThenWrite(marker)}`,
              })
            }).pipe(Effect.exit),
          )
          while (!(yield* fileSystem.exists(started))) yield* Effect.sleep(10)
          yield* Fiber.interrupt(running)
          const reused = yield* runCell({ pool, sessionId: "s", cellId: "c3", code: "process.pid" })
          expect(reused.value).not.toBe(first.value)
          /**
           * Watching for the marker past the moment the cell would have written it is stronger than
           * sleeping once and looking afterwards: a surviving cell fails the assertion as soon as
           * its write lands, rather than only if it happens to land inside a fixed window.
           */
          const deadline = 3_000
          const step = 50
          for (let waited = 0; waited < deadline; waited += step) {
            expect(yield* fileSystem.exists(marker)).toBe(false)
            yield* Effect.sleep(step)
          }
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
