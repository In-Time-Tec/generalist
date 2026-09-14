import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3"
import { layer as cryptoLayer } from "@effect/platform-bun/BunCrypto"
import { afterAll, beforeAll, expect } from "@effect/vitest"
import { localState } from "alchemy"
import { make as makeTest } from "alchemy/Test/Vitest"
import { Context, Crypto, Effect, Layer, Schedule } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { type ConnectionOptions, make as makeS3 } from "../../src/durability/s3.js"
import { exercise, objectConformance, recover } from "./local-operations.js"
import { makeMinioStack, providers } from "./local-minio.js"
import { vi } from "vitest"

beforeAll(() => vi.stubEnv("ALCHEMY_TELEMETRY_DISABLED", "1"))
afterAll(() => vi.unstubAllEnvs())

const local = makeTest({ providers, state: localState(), dev: false, sidecar: false })
const stack = makeMinioStack({
  name: "generalist-local-minio",
  credentials: { accessKeyId: "local-integration-only", secretAccessKey: "local-integration-not-a-secret" },
})

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
    } satisfies ConnectionOptions
    yield* Effect.acquireUseRelease(
      Effect.sync(() => new S3Client(connection)),
      (client) =>
        Effect.tryPromise(() => client.send(new CreateBucketCommand({ Bucket: connection.bucket }))).pipe(
          Effect.retry({ times: 40, schedule: Schedule.spaced("100 millis") }),
        ),
      (client) => Effect.sync(() => client.destroy()),
    )
    yield* objectConformance(makeS3(connection))
    const expected = yield* exercise(makeS3(connection))
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    yield* spawner.string(ChildProcess.make("docker", ["restart", server.id]))
    const binding = yield* spawner.string(ChildProcess.make("docker", ["port", server.id, "9000/tcp"]))
    const endpoint = `http://${binding.trim()}`
    expect(new URL(endpoint).hostname).toBe("127.0.0.1")
    const store = yield* makeS3({ ...connection, endpoint })
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
