import { expect, layer } from "@effect/vitest"
import { Deferred, Effect, Exit, Fiber } from "effect"
import type { CellFailure, CellResult } from "../../src/repl/repl/cell.js"
import { liveOptions, platform, runCell, withPool } from "./bun-harness.js"

layer(platform, liveOptions)("Bun kernel kill restart", (it) => {
  /**
   * The kernel runs in a child process rather than a thread precisely so that killing a wedged cell
   * cannot take the host down with it. `@effect/platform` BunWorker was rejected because terminating
   * a thread during a spinning `vm` script exits the HOST process with SIGTRAP; these tests assert
   * the property that decision bought.
   */
  it.effect("survives killing a kernel while a cell is spinning, and the host process stays alive", () =>
    withPool({
      overrides: { cellDeadlineMillis: 30_000, interruptGraceMillis: 100 },
      use: ({ pool }) =>
        Effect.gen(function* () {
          const hostPid = process.pid
          const running = yield* Effect.forkChild(
            Effect.exit(runCell({ pool, sessionId: "s", cellId: "c1", code: "while (true) {}" })),
          )
          yield* Effect.sleep(200)
          const restarted = yield* Effect.timeout(pool.restart("s", "killed"), 10_000)
          expect(restarted.epoch).toBe(1)
          const outcome = yield* Fiber.join(running)
          expect(outcome._tag).toBe("Failure")
          expect(process.pid).toBe(hostPid)
          const alive = yield* runCell({ pool, sessionId: "s", cellId: "c2", code: "1 + 1" })
          expect(alive.value).toBe("2")
        }),
    }),
  )

  it.effect("starts a new epoch when a Session is restarted", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          yield* runCell({ pool, sessionId: "s", cellId: "c1", code: "const kept = 7" })
          const restart = yield* pool.restart("s", "requested")
          expect(restart.epoch).toBe(1)
          expect(restart.reason).toBe("requested")
          const inspection = yield* pool.inspect({ sessionId: "s" })
          expect(inspection.epoch).toBe(1)
        }),
    }),
  )

  it.effect("reports the restart account of what a new epoch carried and dropped", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: ["const value = 5", "function shape() { return value }", 'const mod = await import("effect")'].join(
              "\n",
            ),
          })
          const restart = yield* pool.restart("s", "killed")
          expect(restart.restoredNames).toContain("value")
          expect(restart.droppedNames).toContain("mod")
        }),
    }),
  )

  it.effect("runs a cell in the new epoch after a restart", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          yield* runCell({ pool, sessionId: "s", cellId: "c1", code: "const before = 1" })
          yield* pool.restart("s", "requested")
          const result = yield* runCell({ pool, sessionId: "s", cellId: "c2", code: "2 + 2" })
          expect(result.value).toBe("4")
          expect(result.epoch).toBe(1)
        }),
    }),
  )

  it.effect("closes a Session whose cell is wedged, without blocking on the wedged kernel", () =>
    withPool({
      overrides: { cellDeadlineMillis: 30_000, interruptGraceMillis: 100 },
      use: ({ pool }) =>
        Effect.gen(function* () {
          const hostPid = process.pid
          const running = yield* Effect.forkChild(
            Effect.exit(runCell({ pool, sessionId: "s", cellId: "c1", code: "while (true) {}" })),
          )
          yield* Effect.sleep(200)
          yield* Effect.timeout(pool.close("s"), 10_000)
          const outcome = yield* Fiber.join(running)
          expect(outcome._tag).toBe("Failure")
          expect(process.pid).toBe(hostPid)
        }),
    }),
  )

  it.effect("settles an in-flight cell when the pool scope closes under it", () =>
    Effect.gen(function* () {
      const settled = yield* Deferred.make<Exit.Exit<CellResult, CellFailure>>()
      yield* withPool({
        overrides: { cellDeadlineMillis: 30_000 },
        use: ({ pool }) =>
          Effect.gen(function* () {
            const execution = yield* pool.execute({
              sessionId: "s",
              cellId: "c1",
              code: "while (true) {}",
              signal: AbortSignal.any([]),
            })
            yield* Effect.forkDetach(
              Effect.exit(execution.result).pipe(Effect.flatMap((exit) => Deferred.succeed(settled, exit))),
            )
            yield* Effect.sleep(200)
          }),
      })
      const outcome = yield* Effect.timeout(Deferred.await(settled), 8_000)
      expect(Exit.isFailure(outcome)).toBe(true)
    }),
  )
})
