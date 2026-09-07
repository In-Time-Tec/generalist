import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3"
import { layer as bunLayer } from "@effect/platform-bun/BunServices"
import { layer as cryptoLayer } from "@effect/platform-bun/BunCrypto"
import { afterAll, beforeAll, expect, layer } from "@effect/vitest"
import * as Alchemy from "alchemy"
import * as Docker from "alchemy/Docker"
import * as Test from "alchemy/Test/Vitest"
import * as Provider from "alchemy/Provider"
import { Context, Crypto, Effect, FileSystem, Layer, Schedule, Schema } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { Miniflare, convertV4MiniflareOptions } from "miniflare"
import * as S3 from "../../src/durability/s3.js"
import { Head, append, exercise, objectConformance, recover } from "./local-operations.js"
import { build } from "esbuild"
import { vi } from "vitest"

beforeAll(() => vi.stubEnv("ALCHEMY_TELEMETRY_DISABLED", "1"))
afterAll(() => vi.unstubAllEnvs())

const providers = Layer.effect(
  Docker.Providers,
  Provider.collection([Docker.Container, Docker.RemoteImage, Docker.Volume]),
).pipe(
  Layer.provide(Layer.mergeAll(Docker.ContainerProvider(), Docker.RemoteImageProvider(), Docker.VolumeProvider())),
  Layer.provideMerge(Docker.DockerLive),
)
const local = Test.make({ providers, state: Alchemy.localState(), dev: false, sidecar: false })
const stack = Alchemy.Stack(
  "generalist-local-minio",
  { providers, state: Alchemy.localState() },
  Effect.gen(function* () {
    const image = yield* Docker.RemoteImage("Image", {
      name: "minio/minio",
      tag: "RELEASE.2025-04-22T22-12-26Z",
      alwaysPull: false,
    })
    const volume = yield* Docker.Volume("Data", {})
    const container = yield* Docker.Container("Server", {
      image,
      start: true,
      command: ["server", "/data"],
      environment: { MINIO_ROOT_USER: "local-integration-only", MINIO_ROOT_PASSWORD: "local-integration-not-a-secret" },
      ports: [{ internal: 9000, external: "127.0.0.1:" }],
      volumes: [{ hostPath: volume.name, containerPath: "/data" }],
    })
    return { id: container.id, ports: container.ports }
  }),
)

local.test(
  "local MinIO: production S3 conformance, client-injected lost acknowledgement, and server restart recovery",
  Effect.gen(function* () {
    const server = yield* local.deploy(stack)
    const connection = {
      bucket: "generalist-local",
      region: "us-east-1",
      endpoint: `http://127.0.0.1:${server.ports["9000/tcp"]}`,
      forcePathStyle: true,
      credentials: { accessKeyId: "local-integration-only", secretAccessKey: "local-integration-not-a-secret" },
      capabilities: { conditionalCreate: true, strongReadAfterWrite: true, consistentListing: true },
    } satisfies S3.ConnectionOptions
    yield* Effect.acquireUseRelease(
      Effect.sync(() => new S3Client(connection)),
      (client) =>
        Effect.tryPromise(() => client.send(new CreateBucketCommand({ Bucket: connection.bucket }))).pipe(
          Effect.retry({ times: 40, schedule: Schedule.spaced("100 millis") }),
        ),
      (client) => Effect.sync(() => client.destroy()),
    )
    yield* objectConformance(S3.make(connection))
    const expected = yield* exercise(S3.make(connection))
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    yield* spawner.string(ChildProcess.make("docker", ["restart", server.id]))
    const binding = yield* spawner.string(ChildProcess.make("docker", ["port", server.id, "9000/tcp"]))
    const endpoint = `http://${binding.trim()}`
    expect(new URL(endpoint).hostname).toBe("127.0.0.1")
    const store = yield* S3.make({ ...connection, endpoint })
    yield* store
      .read("readiness", { maxBytes: 1 })
      .pipe(Effect.retry({ times: 40, schedule: Schedule.spaced("100 millis") }))
    yield* recover({ store, expected })
  }).pipe(
    Effect.provideServiceEffect(Crypto.Crypto, Layer.build(cryptoLayer).pipe(Effect.map(Context.get(Crypto.Crypto)))),
    Effect.ensuring(local.destroy(stack).pipe(Effect.orDie)),
  ),
  180_000,
)

const nativeFixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const directory = yield* fs.makeTempDirectoryScoped({ prefix: "generalist-native-r2-" })
  const bundle = yield* Effect.tryPromise(() =>
    build({
      entryPoints: ["packages/generalist/test/durability/local-r2-worker.ts"],
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      write: false,
      logLevel: "silent",
    }),
  )
  return {
    start: Effect.acquireRelease(
      Effect.sync(
        () =>
          new Miniflare({
            ...convertV4MiniflareOptions({
              modules: true,
              script: bundle.outputFiles[0]!.text,
              compatibilityDate: "2026-08-18",
              r2Buckets: {
                BUCKET: {
                  id: "generalist-local",
                  s3Credentials: {
                    accessKeyId: "local-integration-only",
                    secretAccessKey: "local-integration-not-a-secret",
                  },
                },
              },
            }),
            host: "127.0.0.1",
            resourcePersistencePath: directory,
            telemetry: { enabled: false },
          }),
      ),
      (worker) => Effect.promise(() => worker.dispose()),
    ),
  }
})

layer(bunLayer, { excludeTestServices: true, timeout: 180_000 })(
  "local Miniflare 5.20260811.1-alpha with exact-EOF Validator.range patch (not provider qualification)",
  (it) => {
    it.effect("passes unchanged shared native object-store conformance", () =>
      Effect.gen(function* () {
        const { start } = yield* nativeFixture
        const worker = yield* start
        const response = yield* Effect.tryPromise(() => worker.dispatchFetch("http://local/conformance"))
        expect(response.status, yield* Effect.tryPromise(() => response.clone().text())).toBe(200)
        expect(yield* Effect.tryPromise(() => response.json())).toEqual({ result: "passed" })
      }),
    )

    it.effect("rejects explicit offsets 3 and 4 on a three-byte native object as typed invalid responses", () =>
      Effect.gen(function* () {
        const { start } = yield* nativeFixture
        const worker = yield* start
        const response = yield* Effect.tryPromise(() => worker.dispatchFetch("http://local/range-boundaries"))
        expect(response.status, yield* Effect.tryPromise(() => response.clone().text())).toBe(200)
        expect(yield* Effect.tryPromise(() => response.json())).toEqual([
          { offset: 3, reason: "invalid-response" },
          { offset: 4, reason: "invalid-response" },
        ])
      }),
    )

    it.effect("recovers Journal snapshots and receipts after workerd restart and races native/S3 writers", () =>
      Effect.gen(function* () {
        const { start } = yield* nativeFixture
        const expected = yield* Effect.scoped(
          Effect.gen(function* () {
            const worker = yield* start
            yield* Effect.promise(() => worker.ready)
            const response = yield* Effect.tryPromise(() => worker.dispatchFetch("http://local/exercise"))
            expect(response.status, yield* Effect.tryPromise(() => response.clone().text())).toBe(200)
            return yield* Effect.tryPromise(() => response.json()).pipe(
              Effect.flatMap(Schema.decodeUnknownEffect(Head)),
            )
          }),
        )
        yield* Effect.scoped(
          Effect.gen(function* () {
            const worker = yield* start
            yield* Effect.promise(() => worker.ready)
            const s3 = yield* S3.make({
              bucket: "generalist-local",
              region: "auto",
              forcePathStyle: true,
              endpoint: new URL("/cdn-cgi/local/r2/s3", yield* Effect.promise(() => worker.ready)).href,
              credentials: { accessKeyId: "local-integration-only", secretAccessKey: "local-integration-not-a-secret" },
              capabilities: { conditionalCreate: true, strongReadAfterWrite: true, consistentListing: true },
            })
            yield* recover({ store: s3, expected })
            const contenders = yield* Effect.all(
              [
                append({ store: s3, id: "s3-interop" }),
                Effect.tryPromise(() => worker.dispatchFetch("http://local/contend")).pipe(
                  Effect.flatMap((response) => {
                    expect(response.status).toBe(200)
                    return Effect.tryPromise(() => response.json())
                  }),
                ),
              ],
              { concurrency: 2 },
            )
            const receipts = yield* Effect.forEach(contenders, (value) =>
              Schema.decodeUnknownEffect(Schema.Struct({ count: Schema.Int }))(value),
            )
            expect(receipts.map((value) => value.count).toSorted()).toEqual([7, 8])
            const response = yield* Effect.tryPromise(() => worker.dispatchFetch("http://local/verify"))
            expect(response.status).toBe(200)
            const head = yield* Effect.tryPromise(() => response.json()).pipe(
              Effect.flatMap(Schema.decodeUnknownEffect(Head)),
            )
            expect(head.state.count).toBe(8)
          }),
        )
      }),
    )
  },
)
