import { connect, createServer } from "node:net"
import { layer as bunServicesLayer } from "@effect/platform-bun/BunServices"
import { describe, expect, layer } from "@effect/vitest"
import { Effect, Layer, Option, Schema, Stream } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { ChildProcess } from "effect/unstable/process"
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

const startServer = (port: number) =>
  ChildProcess.make(process.execPath, ["run", "--cwd", "examples/deep-research-agent/server", "start"], {
    env: {
      PORT: String(port),
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
          const port = yield* freePort
          yield* startServer(port)
          yield* waitForServerReady(port, 200)
          const client = yield* Server.client({ baseUrl: `http://127.0.0.1:${port}` })
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

          yield* client.approvals.resolve({
            runId: run.id,
            token: approval.event.request.approvalId,
            decision: { _tag: "Approved" },
            operator: "operator:e2e",
          })
          const resumed = Array.from(
            yield* client.events.subscribe({ sessionId: session.id, cursor: approval.cursor }).pipe(
              Stream.takeUntil((item) => item._tag === "Completed"),
              Stream.runCollect,
            ),
          )
          const completed = resumed.find((item) => item._tag === "Completed" && item.event._tag === "RunCompleted")

          expect(first[0]).toMatchObject({ _tag: "RunStarted", runId: run.id })
          expect(completed).toMatchObject({
            _tag: "Completed",
            runId: run.id,
            event: { _tag: "RunCompleted" },
          })
          expect(yield* client.runs.inspect({ runId: run.id })).toMatchObject({ status: "succeeded" })
        }),
      ),
    )
  })
})
