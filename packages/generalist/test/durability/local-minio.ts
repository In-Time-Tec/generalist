/* oxlint-disable effecttsgo/any-unknown-in-error-context -- Alchemy's standalone adapter exposes any at this test-only resource boundary. */
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3"
import { localState, Stack } from "alchemy"
import {
  Container,
  ContainerProvider,
  DockerLive,
  Providers,
  RemoteImage,
  RemoteImageProvider,
  Volume,
  VolumeProvider,
} from "alchemy/Docker"
import { destroy, deploy, toEffect } from "alchemy/Test/Core"
import { Crypto, Effect, Layer, Schedule, Schema } from "effect"
import { collection } from "alchemy/Provider"

export interface LocalS3 {
  readonly endpoint: string
  readonly bucket: string
  readonly runId: string
}

export class LocalMinioFailed extends Schema.TaggedError<LocalMinioFailed>()("generalist/test/LocalMinioFailed", {
  message: Schema.String,
}) {}

export interface Credentials {
  readonly accessKeyId: string
  readonly secretAccessKey: string
}

export const providers = Layer.effect(Providers, collection([Container, RemoteImage, Volume])).pipe(
  Layer.provide(Layer.mergeAll(ContainerProvider(), RemoteImageProvider(), VolumeProvider())),
  Layer.provideMerge(DockerLive),
)

export const minioImage = {
  name: "quay.io/minio/minio",
  tag: "RELEASE.2025-04-22T22-12-26Z",
} as const

export const makeMinioStack = (input: { readonly name: string; readonly credentials: Credentials }) =>
  Stack(
    input.name,
    { providers, state: localState() },
    Effect.gen(function* () {
      const image = yield* RemoteImage("Image", {
        ...minioImage,
        alwaysPull: false,
      })
      const volume = yield* Volume("Data", {})
      const container = yield* Container("Server", {
        image,
        start: true,
        command: ["server", "/data"],
        environment: {
          MINIO_ROOT_USER: input.credentials.accessKeyId,
          MINIO_ROOT_PASSWORD: input.credentials.secretAccessKey,
        },
        ports: [{ internal: 9000, external: "127.0.0.1:" }],
        volumes: [{ hostPath: volume.name, containerPath: "/data" }],
      })
      return { id: container.id, ports: container.ports }
    }),
  )

export const credentials = {
  accessKeyId: "scripted-surfaces-local-only",
  secretAccessKey: "scripted-surfaces-not-a-secret",
}

const acquire = (input: {
  readonly alchemy: {
    readonly providers: typeof providers
    readonly state: ReturnType<typeof localState>
    readonly dev: false
    readonly sidecar: false
  }
  readonly minio: ReturnType<typeof makeMinioStack>
  readonly bucket: string
  readonly runId: string
}) =>
  Effect.gen(function* () {
    const server = yield* deploy(input.alchemy, input.minio)
    const endpoint = `http://127.0.0.1:${server.ports["9000/tcp"]}`
    yield* Effect.acquireUseRelease(
      Effect.sync(() => new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials })),
      (client) =>
        Effect.tryPromise(() => client.send(new CreateBucketCommand({ Bucket: input.bucket }))).pipe(
          Effect.retry({ times: 40, schedule: Schedule.spaced("100 millis") }),
        ),
      (client) => Effect.sync(() => client.destroy()),
    )
    return { endpoint, bucket: input.bucket, runId: input.runId }
  }).pipe(Effect.onError(() => destroy(input.alchemy, input.minio).pipe(Effect.orDie)))

export const withMinio = <A, E>(use: (storage: LocalS3) => Effect.Effect<A, E, never>) =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto
    const runId = yield* crypto.randomUUIDv4
    const alchemy = { providers, state: localState(), dev: false as const, sidecar: false as const }
    const minio = makeMinioStack({ name: `generalist-scripted-surfaces-minio-${runId}`, credentials })
    const bucket = `generalist-scripted-${runId}`
    return yield* toEffect(
      Effect.acquireUseRelease(acquire({ alchemy, minio, bucket, runId }), use, () =>
        destroy(alchemy, minio).pipe(Effect.orDie),
      ),
      alchemy,
    )
  }).pipe(Effect.mapError((cause) => LocalMinioFailed.make({ message: String(cause) })))
