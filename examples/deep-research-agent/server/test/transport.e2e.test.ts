import { connect, createServer } from "node:net"
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3"
import { layer as bunServicesLayer } from "@effect/platform-bun/BunServices"
import { describe, expect, layer } from "@effect/vitest"
import { Effect, Layer, Option, Schedule, Schema, Stream } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { Server } from "generalist/server"

class TransportTestError extends Schema.TaggedError<TransportTestError>()("TransportTestError", {
  message: Schema.String,
}) {}

const freePort = Effect.callback<number, TransportTestError>((resume) => {
  const server = createServer()
  server.once("error", (error) => {
    server.close()
    resume(Effect.fail(TransportTestError.make({ message: `could not allocate a test port: ${String(error)}` })))
  })
  server.listen(0, "127.0.0.1", () => {
    const address = server.address()
    const port = Schema.decodeUnknownOption(Schema.Struct({ port: Schema.Finite }))(address).pipe(
      Option.map((value) => value.port),
      Option.getOrElse(() => 0),
    )
    server.close(() => resume(Effect.succeed(port)))
  })
})

const credentials = { accessKeyId: "research-e2e-local-only", secretAccessKey: "research-e2e-not-a-secret" }
const serverToken = "research-e2e-local-token"

const startServer = (port: number, endpoint: string) =>
  ChildProcess.make(process.execPath, ["run", "--cwd", "examples/deep-research-agent/server", "start"], {
    env: {
      PORT: String(port),
      GENERALIST_SERVER_TOKEN: serverToken,
      GENERALIST_ENVIRONMENT: "research-e2e",
      GENERALIST_TENANT: "research-e2e",
      GENERALIST_PARTITION: "local",
      GENERALIST_BUCKET: "research-e2e",
      GENERALIST_S3_ENDPOINT: endpoint,
      GENERALIST_S3_CAPABILITIES_CONFIRMED: "true",
      AWS_REGION: "us-east-1",
      AWS_ACCESS_KEY_ID: credentials.accessKeyId,
      AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
    },
    extendEnv: false,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  })

const probePort = (port: number): Effect.Effect<void, TransportTestError> =>
  Effect.callback<void, TransportTestError>((resume) => {
    const socket = connect({ port, host: "127.0.0.1" })
    socket.once("connect", () => {
      socket.destroy()
      resume(Effect.void)
    })
    socket.once("error", (error) => {
      socket.destroy()
      resume(
        Effect.fail(
          TransportTestError.make({ message: `server on port ${port} did not accept a connection: ${String(error)}` }),
        ),
      )
    })
  })

const waitForServerReady = (port: number, attempts: number): Effect.Effect<void, TransportTestError> =>
  probePort(port).pipe(
    Effect.catch((error) =>
      attempts <= 0
        ? Effect.fail(error)
        : Effect.sleep("150 millis").pipe(Effect.andThen(waitForServerReady(port, attempts - 1))),
    ),
  )

describe("deep-research-agent server e2e", () => {
  layer(FetchHttpClient.layer.pipe(Layer.provideMerge(bunServicesLayer)), {
    excludeTestServices: true,
    timeout: 60_000,
  })("serves one Host through the typed client", (it) => {
    it.effect("starts, approves, resumes, and completes a deterministic Run", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
          yield* Effect.acquireUseRelease(
            spawner.string(
              ChildProcess.make("docker", [
                "run",
                "--rm",
                "--detach",
                "--publish",
                "127.0.0.1::9000",
                "--tmpfs",
                "/data",
                "--env",
                `MINIO_ROOT_USER=${credentials.accessKeyId}`,
                "--env",
                `MINIO_ROOT_PASSWORD=${credentials.secretAccessKey}`,
                "minio/minio:RELEASE.2025-04-22T22-12-26Z",
                "server",
                "/data",
              ]),
            ),
            (container) =>
              Effect.scoped(
                Effect.gen(function* () {
                  const binding = yield* spawner.string(
                    ChildProcess.make("docker", ["port", container.trim(), "9000/tcp"]),
                  )
                  const endpoint = `http://${binding.trim()}`
                  expect(new URL(endpoint).hostname).toBe("127.0.0.1")
                  yield* Effect.acquireUseRelease(
                    Effect.sync(
                      () => new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials }),
                    ),
                    (s3) =>
                      Effect.tryPromise(() => s3.send(new CreateBucketCommand({ Bucket: "research-e2e" }))).pipe(
                        Effect.retry({ times: 40, schedule: Schedule.spaced("100 millis") }),
                      ),
                    (s3) => Effect.sync(() => s3.destroy()),
                  )
                  const port = yield* freePort
                  yield* startServer(port, endpoint)
                  yield* waitForServerReady(port, 200)
                  const http = (yield* HttpClient.HttpClient).pipe(
                    HttpClient.mapRequest(HttpClientRequest.bearerToken(serverToken)),
                  )
                  const unknown = yield* http.get(`http://127.0.0.1:${port}/sessions/not-real/events`)
                  expect(unknown.status).toBe(404)
                  expect(yield* HttpClientResponse.schemaBodyJson(Server.ApiError)(unknown)).toMatchObject({
                    _tag: "generalist/host/SessionNotFound",
                    sessionId: "not-real",
                  })
                  const client = yield* Server.client({ baseUrl: `http://127.0.0.1:${port}` }).pipe(
                    Effect.provideService(HttpClient.HttpClient, http),
                  )
                  expect(yield* client.sessions.list()).toEqual([])
                  const session = yield* client.sessions.create({ id: "deep-research-e2e-session" })
                  const run = yield* client.runs.start({
                    sessionId: session.id,
                    agent: "deep-research-agent",
                    input: "What makes Generalist agent framework standalone?",
                    idempotencyKey: "question-1",
                  })
                  const first = Array.from(
                    yield* client.events.subscribe({ sessionId: session.id }).pipe(
                      Stream.takeUntil((item) => item._tag === "ApprovalRequested"),
                      Stream.runCollect,
                    ),
                  )
                  const approval = first.find((item) => item._tag === "ApprovalRequested")
                  if (approval === undefined || approval.event._tag !== "ApprovalRequested") {
                    return yield* Effect.die("expected ApprovalRequested")
                  }
                  const approvalId = approval.event.request.approvalId
                  const explanation = yield* client.operator.explain({ runId: run.id }).pipe(
                    Effect.repeat({
                      schedule: Schedule.spaced("25 millis"),
                      until: (state) =>
                        state.obligations.some(
                          (obligation) => obligation._tag === "AwaitApproval" && obligation.token === approvalId,
                        ),
                    }),
                  )
                  expect(explanation.obligations).toContainEqual(
                    expect.objectContaining({ _tag: "AwaitApproval", token: approvalId }),
                  )
                  yield* client.approvals.resolve({
                    runId: run.id,
                    token: approvalId,
                    decision: { _tag: "Approved" },
                  })
                  const resumed = Array.from(
                    yield* client.events.subscribe({ sessionId: session.id, cursor: approval.cursor }).pipe(
                      Stream.takeUntil((item) => item._tag === "Completed"),
                      Stream.runCollect,
                    ),
                  )
                  const completed = resumed.find(
                    (item) => item._tag === "Completed" && item.event._tag === "RunCompleted",
                  )

                  expect(first[0]).toMatchObject({ _tag: "RunStarted", runId: run.id })
                  expect(completed).toMatchObject({
                    _tag: "Completed",
                    runId: run.id,
                    event: { _tag: "RunCompleted" },
                  })
                  expect(yield* client.runs.inspect({ runId: run.id })).toMatchObject({ status: "succeeded" })
                }),
              ),
            (container) => spawner.string(ChildProcess.make("docker", ["stop", container.trim()])),
          )
        }),
      ),
    )
  })
})
