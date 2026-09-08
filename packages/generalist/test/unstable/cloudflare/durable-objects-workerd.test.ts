import { layer as bunLayer } from "@effect/platform-bun/BunServices"
import { expect, layer } from "@effect/vitest"
import { Effect, FileSystem, Path, Schema } from "effect"
import { build } from "esbuild"
import { Miniflare, convertV4MiniflareOptions } from "miniflare"

const Status = Schema.Struct({
  status: Schema.String,
  visits: Schema.Int,
  alarms: Schema.Int,
  completedAlarms: Schema.Int,
  alarm: Schema.NullOr(Schema.Finite),
  objects: Schema.Int,
})
const Reconciled = Schema.Struct({ dispatches: Schema.Int })
const Receipt = Schema.Struct({ runId: Schema.String, duplicate: Schema.Boolean })

const bundleWorker = Effect.gen(function* () {
  const path = yield* Path.Path
  const bundle = yield* Effect.tryPromise(() =>
    build({
      entryPoints: [path.resolve("packages/generalist/test/unstable/cloudflare/workerd/host-worker.ts")],
      bundle: true,
      format: "esm",
      logLevel: "silent",
      write: false,
      platform: "browser",
      target: "es2022",
    }),
  )
  return bundle.outputFiles[0]!.text
})

const open = (script: string, directory: string) =>
  Effect.acquireRelease(
    Effect.sync(
      () =>
        new Miniflare({
          ...convertV4MiniflareOptions({
            modules: true,
            script,
            compatibilityDate: "2026-08-18",
            r2Buckets: ["BUCKET"],
            durableObjects: { OBJECTS: { className: "AlarmRuntimeObject", unsafeUniqueKey: "alarm-host" } },
          }),
          host: "127.0.0.1",
          resourcePersistencePath: directory,
          telemetry: { enabled: false },
        }),
    ).pipe(Effect.tap((worker) => Effect.promise(() => worker.ready))),
    (worker) => Effect.promise(() => worker.dispose()),
  )

const request = (worker: Miniflare, path: string) =>
  Effect.gen(function* () {
    const response = yield* Effect.promise(() => worker.dispatchFetch(`http://host${path}`))
    expect(response.status, yield* Effect.promise(() => response.clone().text())).toBe(200)
    return yield* Effect.promise(() => response.json())
  })

const status = (worker: Miniflare, key: string) =>
  request(worker, `/status?key=${key}`).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Status)))

const awaitStatus = (worker: Miniflare, key: string, ready: (value: typeof Status.Type) => boolean) =>
  Effect.gen(function* () {
    let result = yield* status(worker, key)
    for (let attempt = 0; !ready(result) && attempt < 200; attempt += 1) {
      yield* Effect.sleep("50 millis")
      result = yield* status(worker, key)
    }
    expect(ready(result), yield* Schema.encodeEffect(Schema.fromJsonString(Status))(result)).toBe(true)
    return result
  })

layer(bunLayer, { excludeTestServices: true, timeout: 60_000 })("persistent workerd Runtime alarms", (it) => {
  it.effect("cold-opens R2 work, resumes it from a real native alarm, and retires after duplicate alarms", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "generalist-native-alarm-" })
      const script = yield* bundleWorker
      yield* Effect.scoped(
        Effect.gen(function* () {
          const worker = yield* open(script, directory)
          const receipt = yield* request(worker, "/admit?key=cold&mode=lost").pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(Receipt)),
          )
          expect(receipt).toEqual({ runId: "cold", duplicate: false })
          expect(yield* status(worker, "cold")).toMatchObject({ status: "running", visits: 0, alarms: 0, alarm: null })
        }),
      )
      yield* Effect.scoped(
        Effect.gen(function* () {
          const worker = yield* open(script, directory)
          expect(yield* status(worker, "cold")).toMatchObject({ status: "running", visits: 0, alarms: 0 })
          yield* request(worker, "/notify")
          const completed = yield* awaitStatus(
            worker,
            "cold",
            (value) => value.status === "succeeded" && value.completedAlarms > 0 && value.alarm === null,
          )
          expect(completed.visits).toBe(1)
          yield* request(worker, "/duplicate")
          const idle = yield* status(worker, "cold")
          expect(idle.visits).toBe(1)
          expect(idle.alarm).toBeNull()
          yield* Effect.sleep("750 millis")
          expect(yield* status(worker, "cold")).toEqual(idle)
        }),
      )
    }),
  )

  it.effect("keeps receipts after lost and failed doorbells and recovers from an independent Worker", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "generalist-lost-alarm-" })
      const script = yield* bundleWorker
      yield* Effect.scoped(
        Effect.gen(function* () {
          const worker = yield* open(script, directory)
          for (const key of ["lost", "failed"]) {
            const receipt = yield* request(worker, `/admit?key=${key}&mode=${key}`).pipe(
              Effect.flatMap(Schema.decodeUnknownEffect(Receipt)),
            )
            expect(receipt).toEqual({ runId: key, duplicate: false })
            expect(yield* status(worker, key)).toMatchObject({ status: "running", visits: 0, alarms: 0, alarm: null })
          }
        }),
      )
      const worker = yield* open(script, directory)
      const reconciled = yield* request(worker, "/reconcile").pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Reconciled)),
      )
      expect(reconciled.dispatches).toBe(2)
      for (const key of ["lost", "failed"]) {
        expect(yield* status(worker, key)).toMatchObject({ status: "succeeded", visits: 0, alarms: 0, alarm: null })
        const retry = yield* request(worker, `/admit?key=${key}&mode=lost`).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(Receipt)),
        )
        expect(retry).toEqual({ runId: key, duplicate: false })
      }
      expect(yield* request(worker, "/reconcile").pipe(Effect.flatMap(Schema.decodeUnknownEffect(Reconciled)))).toEqual(
        {
          dispatches: 0,
        },
      )
    }),
  )

  it.effect("accepts new commands while a native alarm awaits long-running tool work", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "generalist-concurrent-alarm-" })
      const script = yield* bundleWorker
      const worker = yield* open(script, directory)
      yield* request(worker, "/admit?key=held&mode=held")
      const held = yield* awaitStatus(worker, "held", (value) => value.visits === 1)
      expect(held.status).toBe("running")
      expect(held.completedAlarms).toBe(0)
      const admitted = yield* request(worker, "/admit?key=concurrent").pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Receipt)),
      )
      expect(admitted.runId).toBe("concurrent")
      expect(yield* status(worker, "held")).toMatchObject({ status: "running", completedAlarms: 0 })
      yield* request(worker, "/release")
      yield* awaitStatus(worker, "concurrent", (value) => value.status === "succeeded" && value.alarm === null)
      yield* request(worker, "/duplicate")
      expect(yield* status(worker, "held")).toMatchObject({ status: "succeeded", visits: 2 })
    }),
  )
})
