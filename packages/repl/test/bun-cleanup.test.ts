import { expect, layer } from "@effect/vitest"
import { Effect, Fiber } from "effect"
import { liveOptions, ownWorkers, platform, runCell, withPool } from "./bun-harness.js"

/**
 * Releasing a kernel is a process kill and a reap, which is fast; the old two-minute ceiling
 * existed only to tolerate a scope-close hang that is now fixed in the session itself. A generous
 * but bounded ceiling keeps a regression a failure rather than a stalled suite.
 */
const processTestOptions = { timeout: 20_000 }

layer(platform, liveOptions)("Bun kernel cleanup", (it) => {
  /**
   * Every kernel process, pipe, and temporary file has a visible owner: the pool's scope. When that
   * scope closes the child process goes with it, whether the cell completed, was cancelled, or was
   * still in flight. Each assertion counts only the workers THIS test process owns, and pairs a
   * "was alive" observation with an "is gone" one, so it proves release rather than absence.
   */
  const assertReleased = <E, R>(
    body: (input: { readonly observe: Effect.Effect<number> }) => Effect.Effect<unknown, E, R>,
  ): Effect.Effect<void, E | Error, R> =>
    Effect.gen(function* () {
      const before = yield* ownWorkers
      let peak = 0
      yield* body({
        observe: ownWorkers.pipe(
          Effect.tap((count) =>
            Effect.sync(() => {
              peak = Math.max(peak, count)
            }),
          ),
        ),
      })
      expect(peak).toBeGreaterThan(before)
      expect(yield* ownWorkers).toBe(before)
    })

  it.effect(
    "releases the worker after a Session completes normally",
    () =>
      assertReleased(({ observe }) =>
        withPool({
          use: ({ pool }) =>
            Effect.gen(function* () {
              const result = yield* runCell({ pool, sessionId: "s", cellId: "c1", code: "1 + 1" })
              expect(result.value).toBe("2")
              yield* observe
            }),
        }),
      ),
    processTestOptions,
  )

  it.effect(
    "releases every worker after several Sessions",
    () =>
      assertReleased(({ observe }) =>
        withPool({
          use: ({ pool }) =>
            Effect.gen(function* () {
              yield* runCell({ pool, sessionId: "one", cellId: "c1", code: "1" })
              yield* runCell({ pool, sessionId: "two", cellId: "c1", code: "2" })
              yield* runCell({ pool, sessionId: "three", cellId: "c1", code: "3" })
              yield* observe
            }),
        }),
      ),
    processTestOptions,
  )

  it.effect(
    "releases the worker when the pool scope closes with a cell in flight",
    () =>
      assertReleased(({ observe }) =>
        withPool({
          overrides: { cellDeadlineMillis: 20_000 },
          use: ({ pool }) =>
            Effect.gen(function* () {
              const execution = yield* pool.execute({
                sessionId: "s",
                cellId: "c1",
                code: "await new Promise((resolve) => setTimeout(resolve, 10000)); 'never'",
                signal: AbortSignal.any([]),
              })
              yield* Effect.forkChild(Effect.exit(execution.result))
              yield* Effect.sleep(150)
              yield* observe
            }),
        }),
      ),
    processTestOptions,
  )

  it.effect(
    "releases the worker when a cell is cancelled mid-flight",
    () =>
      assertReleased(({ observe }) =>
        withPool({
          overrides: { cellDeadlineMillis: 20_000 },
          use: ({ pool }) =>
            Effect.gen(function* () {
              const running = yield* Effect.forkChild(
                runCell({
                  pool,
                  sessionId: "s",
                  cellId: "c1",
                  code: "await new Promise((resolve) => setTimeout(resolve, 10000)); 'never'",
                }),
              )
              yield* Effect.sleep(150)
              yield* observe
              yield* Fiber.interrupt(running)
            }),
        }),
      ),
    processTestOptions,
  )

  it.effect(
    "removes the Session's snapshot when it is dropped",
    () =>
      withPool({
        use: ({ pool, dataRoot }) =>
          Effect.gen(function* () {
            yield* runCell({ pool, sessionId: "s", cellId: "c1", code: "const value = 1" })
            yield* pool.close("s")
            const { BunKernelStateStore } = yield* Effect.promise(() => import("../src/repl/bun.js"))
            const store = yield* BunKernelStateStore.make({ dataRoot })
            yield* store.drop("s")
            expect(yield* store.load("s")).toBeUndefined()
          }),
      }),
    processTestOptions,
  )
})
