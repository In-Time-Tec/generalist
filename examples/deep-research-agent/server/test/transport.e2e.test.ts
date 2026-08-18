import { connect, createServer } from "node:net"
import { layer as bunServicesLayer } from "@effect/platform-bun/BunServices"
import { describe, expect, layer } from "@effect/vitest"
import { Effect, Layer, Schema, Stream } from "effect"
import { FetchHttpClient, HttpBody, HttpClient, HttpClientError, HttpClientResponse } from "effect/unstable/http"
import { ChildProcess } from "effect/unstable/process"
import { Cursor } from "tenetkit/runtime"
import { Client } from "tenetkit/transport"

const encodeJson = (value: unknown): string => Schema.encodeSync(Schema.UnknownFromJsonString)(value)

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
): Effect.Effect<typeof RunReceipt.Type, HttpClientError.HttpClientError | Schema.SchemaError, HttpClient.HttpClient> =>
  postJson(`${baseUrl}/runs`, {
    runId: "deep-research-e2e-run",
    sessionId: "deep-research-e2e-session",
    idempotencyKey: "question-1",
    prompt: "What makes TenetKit agent framework standalone?",
  }).pipe(
    Effect.flatMap(HttpClientResponse.schemaBodyJson(RunReceipt)),
    Effect.catch((error) =>
      attempts <= 0
        ? Effect.fail(error)
        : Effect.sleep("100 millis").pipe(Effect.andThen(admitRun(baseUrl, attempts - 1))),
    ),
  )

const freePort = Effect.callback<number, TransportTestError>((resume) => {
  const server = createServer()
  server.once("error", (error) => {
    server.close()
    resume(Effect.fail(TransportTestError.make({ message: `could not allocate a test port: ${String(error)}` })))
  })
  server.listen(0, "127.0.0.1", () => {
    const address = server.address()
    const port = typeof address === "object" && address !== null ? address.port : 0
    server.close(() => resume(Effect.succeed(port)))
  })
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

describe("deep-research-agent TenetKit transport e2e", () => {
  layer(FetchHttpClient.layer.pipe(Layer.provideMerge(bunServicesLayer)), {
    excludeTestServices: true,
    timeout: 60_000,
  })("admits a deterministic run, resolves its approval, and replays canonical SSE events", (it) => {
    it.effect("admits a deterministic run, resolves its approval, and replays canonical SSE events", () =>
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
            return yield* Effect.die(`expected RunWaiting: ${encodeJson(Array.from(first))}`)
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
          const committedResponse = all.find((event) => event._tag === "ModelResponseCommitted")
          const toolCall =
            committedResponse?._tag === "ModelResponseCommitted"
              ? committedResponse.response.content.find((part) => part.type === "tool-call")
              : undefined
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
                input: { query: "What makes TenetKit agent framework standalone?" },
              },
            },
          })
          expect(approvalRequested).toMatchObject({
            _tag: "ApprovalRequested",
            request: {
              approvalId: "approval:search-1",
              operation: "search-1",
              capability: "web_search",
              input: { query: "What makes TenetKit agent framework standalone?" },
            },
          })
          expect(approvalRequested?._tag === "ApprovalRequested" ? approvalRequested.request : undefined).toEqual(
            waiting.wait.reason._tag === "Approval" ? waiting.wait.reason.request : undefined,
          )
          expect(toolCall).toMatchObject({
            type: "tool-call",
            name: "web_search",
            params: { query: "What makes TenetKit agent framework standalone?" },
          })
          expect(completedTool).toMatchObject({
            _tag: "ToolExecutionCompleted",
            result: { name: "web_search" },
          })
          if (completed?._tag !== "RunCompleted" || "_tag" in completed.result) {
            return yield* Effect.die("expected an Agent RunCompleted event")
          }
          expect(completed.result.text).toContain("Based on 2 sources")
          expect(completed.result.text).toContain("https://github.com/tenetkit/tenetkit")
        }),
      ),
    )
  })
})
