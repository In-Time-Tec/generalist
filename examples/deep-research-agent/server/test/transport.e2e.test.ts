import { connect, createServer } from "node:net"
import { layer as bunServicesLayer } from "@effect/platform-bun/BunServices"
import { describe, expect, live } from "@effect/vitest"
import { Effect, Layer, Schema, Stream } from "effect"
import { FetchHttpClient, HttpBody, HttpClient, HttpClientResponse } from "effect/unstable/http"
import { ChildProcess } from "effect/unstable/process"
import { Cursor } from "@batonfx/runtime"
import { Client } from "@batonfx/transport"

const RunReceipt = Schema.Struct({
  runId: Schema.String,
  duplicate: Schema.Boolean,
  acceptedSequence: Schema.Int,
})

class TransportTestError extends Schema.TaggedErrorClass<TransportTestError>()("TransportTestError", {
  message: Schema.String,
}) {}

const postJson = (url: string, body: unknown) =>
  HttpClient.post(url, { body: HttpBody.jsonUnsafe(body) }).pipe(Effect.flatMap(HttpClientResponse.filterStatusOk))

const admitRun = (
  baseUrl: string,
  attempts: number,
): Effect.Effect<typeof RunReceipt.Type, unknown, HttpClient.HttpClient> =>
  postJson(`${baseUrl}/runs`, {
    runId: "deep-research-e2e-run",
    sessionId: "deep-research-e2e-session",
    idempotencyKey: "question-1",
    prompt: "What makes Baton agent framework standalone?",
  }).pipe(
    Effect.flatMap(HttpClientResponse.schemaBodyJson(RunReceipt)),
    Effect.catch((error) =>
      attempts <= 0
        ? Effect.fail(error)
        : Effect.sleep("100 millis").pipe(Effect.andThen(admitRun(baseUrl, attempts - 1))),
    ),
  )

const freePort = Effect.tryPromise({
  try: () =>
    new Promise<number>((resolve, reject) => {
      const server = createServer()
      server.once("error", reject)
      server.listen(0, "127.0.0.1", () => {
        const address = server.address()
        const port = typeof address === "object" && address !== null ? address.port : 0
        server.close(() => resolve(port))
      })
    }),
  catch: (error) => TransportTestError.make({ message: `could not allocate a test port: ${String(error)}` }),
})

const startServer = (port: number) =>
  ChildProcess.make("bun", ["run", "--cwd", "examples/deep-research-agent/server", "start"], {
    env: {
      OPENROUTER_API_KEY: undefined,
      EXA_API_KEY: undefined,
      PORT: String(port),
    },
    extendEnv: true,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  })

const probePort = (port: number) =>
  Effect.tryPromise({
    try: () =>
      new Promise<void>((resolve, reject) => {
        const socket = connect({ port, host: "127.0.0.1" })
        socket.once("connect", () => {
          socket.destroy()
          resolve()
        })
        socket.once("error", (error) => {
          socket.destroy()
          reject(error)
        })
      }),
    catch: (error) =>
      TransportTestError.make({ message: `server on port ${port} did not accept a connection: ${String(error)}` }),
  })

const waitForServerReady = (port: number, attempts: number): Effect.Effect<void, TransportTestError> =>
  probePort(port).pipe(
    Effect.catch((error) =>
      attempts <= 0
        ? Effect.fail(error)
        : Effect.sleep("150 millis").pipe(Effect.andThen(waitForServerReady(port, attempts - 1))),
    ),
  )

describe("deep-research-agent Baton transport e2e", () => {
  live(
    "admits a deterministic run, resolves its approval, and replays canonical SSE events",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const port = yield* freePort
          yield* startServer(port)
          const baseUrl = `http://127.0.0.1:${port}`
          yield* waitForServerReady(port, 200)
          const receipt = yield* admitRun(baseUrl, 50)
          const eventsUrl = `${baseUrl}/runs/${receipt.runId}/events`
          const first = yield* Client.sseEvents({ url: eventsUrl }).pipe(
            Stream.takeUntil(
              (event) =>
                event._tag === "RunWaiting" ||
                event._tag === "RunCompleted" ||
                event._tag === "RunFailed" ||
                event._tag === "RunCancelled",
            ),
            Stream.runCollect,
          )
          const approvalRequested = Array.from(first).find((event) => event._tag === "ApprovalRequested")
          const waiting = Array.from(first).find((event) => event._tag === "RunWaiting")
          if (waiting === undefined || waiting._tag !== "RunWaiting") {
            return yield* Effect.die(`expected RunWaiting: ${JSON.stringify(Array.from(first))}`)
          }

          yield* postJson(`${baseUrl}/runs/${receipt.runId}/respond`, {
            waitId: waiting.wait.waitId,
            resolution: { _tag: "Approved" },
          })
          const second = yield* Client.sseEvents({ url: eventsUrl, cursor: Cursor.make(waiting.sequence) }).pipe(
            Stream.takeUntil((event) => event._tag === "RunCompleted"),
            Stream.runCollect,
          )
          const all = [...first, ...second]
          const toolCall = all.find((event) => event._tag === "ModelPart" && event.part.type === "tool-call")
          const completedTool = all.find((event) => event._tag === "ToolExecutionCompleted")
          const completed = all.find((event) => event._tag === "RunCompleted")

          expect(receipt.duplicate).toBe(false)
          expect(waiting.wait).toMatchObject({
            waitId: "approval:search-1",
            reason: {
              _tag: "Approval",
              request: {
                approvalId: "approval:search-1",
                operation: "search-1",
                capability: "web_search",
                input: { query: "What makes Baton agent framework standalone?" },
              },
            },
          })
          expect(approvalRequested).toMatchObject({
            _tag: "ApprovalRequested",
            request: {
              approvalId: "approval:search-1",
              operation: "search-1",
              capability: "web_search",
              input: { query: "What makes Baton agent framework standalone?" },
            },
          })
          expect(approvalRequested?._tag === "ApprovalRequested" ? approvalRequested.request : undefined).toEqual(
            waiting.wait.reason._tag === "Approval" ? waiting.wait.reason.request : undefined,
          )
          expect(toolCall).toMatchObject({
            _tag: "ModelPart",
            part: {
              type: "tool-call",
              name: "web_search",
              params: { query: "What makes Baton agent framework standalone?" },
            },
          })
          expect(completedTool).toMatchObject({
            _tag: "ToolExecutionCompleted",
            result: { name: "web_search" },
          })
          if (completed?._tag !== "RunCompleted" || "_tag" in completed.result) {
            return yield* Effect.die("expected an Agent RunCompleted event")
          }
          expect(completed.result.text).toContain("Based on 2 sources")
          expect(completed.result.text).toContain("https://github.com/batonfx/batonfx")
        }),
      ).pipe(Effect.provide(FetchHttpClient.layer.pipe(Layer.provideMerge(bunServicesLayer)))),
    60_000,
  )
})
