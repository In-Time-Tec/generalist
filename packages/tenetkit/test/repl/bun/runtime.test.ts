import "./suites/snapshot-suite.js"
import "./suites/output-coalescing-suite.js"
import "./suites/output-bounds-suite.js"
import "./suites/namespace-suite.js"
import "./suites/kill-restart-suite.js"
import "./suites/host-request-suite.js"
import "./suites/frame-integrity-suite.js"
import "./suites/deadline-suite.js"
import "./suites/channel-bytes-suite.js"
import "./suites/cancellation-suite.js"
import "./suites/bootstrap-suite.js"
import "../suites/bun-result-rendering-suite.js"
import { expect, it as test, layer } from "@effect/vitest"
import { Effect, Fiber, Schema } from "effect"
import { maxResultBytes, toCellEvent } from "../../../src/repl/bun/runtime.js"
import { liveOptions, ownWorkers, platform, runCell, withPool } from "../bun-harness.js"

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
            const { BunKernelStateStore } = yield* Effect.promise(() => import("../../../src/repl/bun/index.js"))
            const store = yield* BunKernelStateStore.make({ dataRoot })
            yield* store.drop("s")
            expect(yield* store.load("s")).toBeUndefined()
          }),
      }),
    processTestOptions,
  )
})

layer(platform, liveOptions)("Bun kernel result bound", (it) => {
  it.effect("bounds an oversized result and names what it dropped", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          const result = yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: "'x'.repeat(100_000)",
          })
          expect(new TextEncoder().encode(result.value).byteLength).toBeLessThan(maxResultBytes + 256)
          expect(result.value).toContain("[result truncated: kept first")
          expect(result.value).toContain("of 100000 bytes")
          expect(result.value).toContain("still in the kernel")
          const truncation = result.truncation.find((entry) => entry.channel === "result")
          expect(truncation?.droppedBytes ?? 0).toBeGreaterThan(0)
        }),
    }),
  )

  it.effect("leaves a small result untouched", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          const result = yield* runCell({ pool, sessionId: "s", cellId: "c1", code: "'small'" })
          expect(result.value).toBe("small")
          expect(result.truncation).toEqual([])
        }),
    }),
  )
})

test("keeps an exactly-at-limit result without a truncation marker", () => {
  const value = "x".repeat(maxResultBytes)
  const event = toCellEvent({ _tag: "Completed", cellId: "cell", value, durationMillis: 0 }, 0)
  expect(event?._tag).toBe("Result")
  if (event?._tag !== "Result") return
  expect(event.value).toBe(value)
  expect(event.value).not.toContain("[result truncated:")
})

test("bounds a multibyte result on a valid UTF-8 prefix", () => {
  const value = `${"x".repeat(maxResultBytes - 1)}🙂TAIL`
  const event = toCellEvent({ _tag: "Completed", cellId: "cell", value, durationMillis: 0 }, 0)
  expect(event?._tag).toBe("Result")
  if (event?._tag !== "Result") return
  const [kept, marker] = event.value.split("\n[result truncated:")
  expect(kept).toBe("x".repeat(maxResultBytes - 1))
  expect(new TextDecoder("utf-8", { fatal: true }).decode(new TextEncoder().encode(kept))).toBe(kept)
  expect(marker).toContain(`kept first ${maxResultBytes - 1} of ${new TextEncoder().encode(value).byteLength} bytes`)
  expect(event.value).not.toContain("TAIL")
  expect(event.value.match(/\[result truncated:/g)).toHaveLength(1)
})

test("keeps an oversized structured result valid JSON", () => {
  const value = JSON.stringify({ content: "first\nsecond\n".repeat(maxResultBytes), tail: "hidden" })
  const event = toCellEvent({ _tag: "Completed", cellId: "cell", value, durationMillis: 0 }, 0)
  expect(event?._tag).toBe("Result")
  if (event?._tag !== "Result") return
  const decoded = Schema.decodeSync(
    Schema.fromJsonString(Schema.Struct({ content: Schema.String, tail: Schema.optionalKey(Schema.String) })),
  )(event.value)
  expect(decoded.content).toContain("first\nsecond")
  expect(new TextEncoder().encode(event.value).byteLength).toBeLessThanOrEqual(maxResultBytes)
  expect(event.value).not.toContain("[result truncated:")
})
