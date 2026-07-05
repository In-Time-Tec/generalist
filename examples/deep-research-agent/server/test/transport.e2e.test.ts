import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { describe, expect, live } from "@effect/vitest"
import { Effect, Fiber, Schema, Stream } from "effect"
import * as Encoding from "effect/unstable/encoding"
import { FetchHttpClient, HttpBody, HttpClient, HttpClientResponse } from "effect/unstable/http"
import { Wire } from "@batonfx/transport"
import { toolkit } from "../src/tools"

const OpenSessionResponse = Schema.Struct({
  sessionId: Schema.String,
  chatId: Schema.String,
})

const postJson = (url: string, body: unknown) =>
  HttpClient.post(url, { body: HttpBody.jsonUnsafe(body) }).pipe(Effect.flatMap(HttpClientResponse.filterStatusOk))

const openSession = (baseUrl: string, sessionId: string) =>
  postJson(`${baseUrl}/sessions`, { sessionId }).pipe(
    Effect.flatMap(HttpClientResponse.schemaBodyJson(OpenSessionResponse)),
  )

const sendMessage = (baseUrl: string, sessionId: string, prompt: string) =>
  postJson(`${baseUrl}/sessions/${sessionId}/messages`, { prompt })

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
  catch: (error) => error,
})

const serverEnv = (port: number): NodeJS.ProcessEnv => {
  const { OPENROUTER_API_KEY: _openRouterApiKey, EXA_API_KEY: _exaApiKey, PORT: _port, ...rest } = process.env
  return { ...rest, PORT: String(port) }
}

const startServer = (port: number) =>
  Effect.acquireRelease(
    Effect.sync(() =>
      spawn("bun", ["run", "--cwd", "examples/deep-research-agent/server", "start"], {
        cwd: process.cwd(),
        env: serverEnv(port),
        stdio: ["ignore", "pipe", "pipe"],
      }),
    ),
    (child) => Effect.sync(() => child.kill()),
  )

const openSessionWithRetry = (
  baseUrl: string,
  sessionId: string,
  attempts: number,
): Effect.Effect<typeof OpenSessionResponse.Type, unknown, HttpClient.HttpClient> =>
  openSession(baseUrl, sessionId).pipe(
    Effect.catch((error) =>
      attempts <= 0
        ? Effect.fail(error)
        : Effect.sleep("100 millis").pipe(Effect.andThen(openSessionWithRetry(baseUrl, sessionId, attempts - 1))),
    ),
  )

const collectSseFrames = (response: HttpClientResponse.HttpClientResponse) =>
  Effect.sync(() => {
    const frames: Array<Wire.LooseServerFrameType> = []
    const parser = Encoding.Sse.makeParser((event) => {
      if (event._tag === "Event") {
        frames.push(Schema.decodeUnknownSync(Wire.ServerFrame(toolkit))(JSON.parse(event.data)))
      }
    })
    return { frames, parser }
  }).pipe(
    Effect.flatMap(({ frames, parser }) =>
      response.stream.pipe(
        Stream.decodeText,
        Stream.runForEachWhile((chunk) =>
          Effect.sync(() => {
            parser.feed(chunk)
            return frames.at(-1)?._tag !== "Ended"
          }),
        ),
        Effect.as(frames),
      ),
    ),
  )

const frameLabel = (frame: Wire.LooseServerFrameType): string => {
  switch (frame._tag) {
    case "Event":
      return `Event:${frame.event._tag}`
    case "SessionStatus":
      return `SessionStatus:${frame.status._tag}`
    default:
      return frame._tag
  }
}

describe("deep-research-agent Baton transport e2e", () => {
  live(
    "starts a deterministic research run over HTTP and streams replayable SSE frames",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const port = yield* freePort
          yield* startServer(port)
          const baseUrl = `http://127.0.0.1:${port}`
          const sessionId = "deep-research-transport-e2e"
          const opened = yield* openSessionWithRetry(baseUrl, sessionId, 50)
          const response = yield* HttpClient.get(`${baseUrl}/sessions/${sessionId}/events`)
          const fiber = yield* collectSseFrames(response).pipe(Effect.forkChild)

          yield* sendMessage(baseUrl, sessionId, "What makes Baton agent framework standalone?")
          const frames = yield* Fiber.join(fiber)
          const labels = frames.map(frameLabel)
          const toolCall = frames.find(
            (frame) =>
              frame._tag === "Event" && frame.event._tag === "ModelPart" && frame.event.part.type === "tool-call",
          )
          const completedTool = frames.find(
            (frame) => frame._tag === "Event" && frame.event._tag === "ToolExecutionCompleted",
          )
          const completed = frames.find((frame) => frame._tag === "Event" && frame.event._tag === "Completed")

          expect(opened.sessionId).toBe(sessionId)
          expect(labels).toEqual([
            "SessionStatus:Running",
            "SessionStatus:Running",
            "Event:TurnStarted",
            "Event:ModelPart",
            "Event:ToolExecutionStarted",
            "Event:ToolExecutionCompleted",
            "Event:TurnCompleted",
            "SessionStatus:Running",
            "Event:TurnStarted",
            "Event:ModelPart",
            "Event:TurnCompleted",
            "Event:Completed",
            "SessionStatus:Idle",
            "Ended",
          ])
          expect(toolCall).toMatchObject({
            _tag: "Event",
            event: {
              _tag: "ModelPart",
              part: {
                type: "tool-call",
                name: "web_search",
                params: { query: "What makes Baton agent framework standalone?" },
              },
            },
          })
          expect(completedTool).toMatchObject({
            _tag: "Event",
            event: {
              _tag: "ToolExecutionCompleted",
              result: {
                name: "web_search",
                result: {
                  results: [
                    { title: "Baton: a standalone Effect-native agent SDK" },
                    { title: "Baton docs - the agent loop" },
                  ],
                },
              },
            },
          })
          expect(completed?._tag === "Event" && completed.event._tag === "Completed" && completed.event.text).toContain(
            "Based on 2 sources",
          )
          expect(completed?._tag === "Event" && completed.event._tag === "Completed" && completed.event.text).toContain(
            "https://github.com/batonfx/batonfx",
          )
        }),
      ).pipe(Effect.provide(FetchHttpClient.layer)),
    20_000,
  )
})
