import { describe, expect, it } from "@effect/vitest"
import { Config, Effect, Layer, Option, Redacted, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/unstable/http"
import { Testing } from "generalist/testing"
import { ExecutionFailed, SandboxProvider, Unavailable, Unsupported } from "../../../../src/sandbox/service.js"
import { layer, makeProvider } from "../../../../src/unstable/sandbox/fly-sprites/index.js"

interface RecordedRequest {
  readonly method: string
  readonly url: string
  readonly headers: Readonly<Record<string, string | undefined>>
  readonly body: string | undefined
}

const bodyText = (request: Parameters<Parameters<typeof HttpClient.make>[0]>[0]): string | undefined =>
  request.body._tag === "Uint8Array" ? new TextDecoder().decode(request.body.body) : undefined

const jsonResponse = (
  request: Parameters<Parameters<typeof HttpClient.make>[0]>[0],
  body: Schema.Json | null,
  status = 200,
) =>
  HttpClientResponse.fromWeb(
    request,
    new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  )

const processResponse = (
  request: Parameters<Parameters<typeof HttpClient.make>[0]>[0],
  stdout: string,
  stderr = "",
  exitCode = 0,
) => {
  const encoder = new TextEncoder()
  const chunks = [
    ...(stdout.length === 0 ? [] : [Uint8Array.from([1, ...encoder.encode(stdout)])]),
    ...(stderr.length === 0 ? [] : [Uint8Array.from([2, ...encoder.encode(stderr)])]),
    Uint8Array.of(3, exitCode),
  ]
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
  return HttpClientResponse.fromWeb(request, new Response(body, { status: 200 }))
}

const fixture = (requests: Array<RecordedRequest> = []) => {
  const sprites = new Set<string>()
  const files = new Map<string, string>()
  return HttpClient.make((request, url) => {
    const body = bodyText(request)
    requests.push({ method: request.method, url: url.toString(), headers: request.headers, body })
    if (url.pathname === "/v1/sprites" && request.method === "POST") {
      const decoded = Schema.decodeUnknownSync(Schema.Struct({ name: Schema.String }))(
        Schema.decodeSync(Schema.fromJsonString(Schema.Json))(body ?? ""),
      )
      sprites.add(decoded.name)
      return Effect.succeed(
        jsonResponse(request, { id: `id-${decoded.name}`, name: decoded.name, status: "cold" }, 201),
      )
    }
    const segments = url.pathname.split("/")
    const name = decodeURIComponent(segments[3] ?? "")
    if (request.method === "GET" && segments.length === 4)
      return Effect.succeed(
        sprites.has(name)
          ? jsonResponse(request, { id: `id-${name}`, name, status: "cold" })
          : jsonResponse(request, { message: "missing" }, 404),
      )
    if (request.method === "DELETE" && segments.length === 4) {
      sprites.delete(name)
      return Effect.succeed(jsonResponse(request, null, 204))
    }
    if (url.pathname.endsWith("/fs/write")) {
      files.set(`${name}:${url.searchParams.get("path")}`, body ?? "")
      return Effect.succeed(
        jsonResponse(request, { path: url.searchParams.get("path"), size: body?.length ?? 0, mode: "0644" }),
      )
    }
    if (url.pathname.endsWith("/fs/read"))
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(files.get(`${name}:${url.searchParams.get("path")}`) ?? "", { status: 200 }),
        ),
      )
    if (!url.pathname.endsWith("/exec"))
      return Effect.succeed(jsonResponse(request, { message: "missing fixture" }, 404))
    const command = url.searchParams.getAll("cmd")
    if (command[0] === "sleep") return Effect.sleep("100 millis").pipe(Effect.as(processResponse(request, "")))
    if (command[0] === "mkdir") return Effect.succeed(processResponse(request, ""))
    const output = command[0] === "printf" ? (command.at(-1) ?? "") : ""
    return Effect.succeed(processResponse(request, output))
  })
}

const recordedLayer = Layer.effect(
  SandboxProvider,
  makeProvider({ token: Redacted.make("sprites-secret"), app: "generalist" }).pipe(
    Effect.provideService(HttpClient.HttpClient, fixture()),
  ),
)

Testing.sandbox({ name: "Fly Sprites recorded", isolation: "microvm", layer: recordedLayer })

it.effect("shapes Fly Sprites create, exec, file, and cleanup requests", () =>
  Effect.gen(function* () {
    const requests: Array<RecordedRequest> = []
    const provider = yield* makeProvider({ token: Redacted.make("sprites-secret"), app: "generalist" }).pipe(
      Effect.provideService(HttpClient.HttpClient, fixture(requests)),
    )
    yield* Effect.scoped(
      Effect.gen(function* () {
        const sandbox = yield* provider.acquire()
        expect(sandbox.isolation).toBe("microvm")
        const files = yield* sandbox.files
        yield* files.writeFileString("/work/file.txt", "stored")
        expect(yield* files.readFileString("/work/file.txt")).toBe("stored")
        expect(
          yield* sandbox.exec({
            _tag: "Process",
            command: "printf",
            arguments: ["%s", "hello"],
            cwd: "/work",
            environment: { LANG: "C" },
            stdin: "input",
          }),
        ).toEqual({ stdout: "hello", stderr: "", exitCode: 0 })
      }),
    )
    expect(requests[0]?.headers.authorization).toBe("Bearer sprites-secret")
    expect(Schema.decodeSync(Schema.fromJsonString(Schema.Json))(requests[0]?.body ?? "")).toMatchObject({
      name: expect.stringMatching(/^generalist-/),
    })
    const execution = requests.find((item) => new URL(item.url).pathname.endsWith("/exec"))
    expect(execution).toBeDefined()
    if (execution === undefined) return
    const url = new URL(execution.url)
    expect(url.searchParams.getAll("cmd")).toEqual(["printf", "%s", "hello"])
    expect(url.searchParams.get("path")).toBe("printf")
    expect(url.searchParams.get("dir")).toBe("/work")
    expect(url.searchParams.getAll("env")).toEqual(["LANG=C"])
    expect(url.searchParams.get("stdin")).toBe("true")
    expect(execution.body).toBe("input")
    expect(requests.at(-1)?.method).toBe("DELETE")
  }),
)

it.effect("maps Fly Sprites protocol and provider failures", () =>
  Effect.gen(function* () {
    let mode: "protocol" | "unavailable" = "protocol"
    const client = HttpClient.make((request, url) => {
      if (url.pathname === "/v1/sprites")
        return Effect.succeed(jsonResponse(request, { id: "id", name: "sprite", status: "cold" }, 201))
      if (request.method === "DELETE") return Effect.succeed(jsonResponse(request, null, 204))
      if (mode === "unavailable") return Effect.succeed(jsonResponse(request, { message: "capacity" }, 503))
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(Uint8Array.of(1, 111, 107))
          controller.close()
        },
      })
      return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(body, { status: 200 })))
    })
    const provider = yield* makeProvider({ token: Redacted.make("key"), app: "fixture" }).pipe(
      Effect.provideService(HttpClient.HttpClient, client),
    )
    yield* Effect.scoped(
      Effect.gen(function* () {
        const sandbox = yield* provider.acquire()
        const protocol = yield* sandbox.exec({ _tag: "Process", command: "true", arguments: [] }).pipe(Effect.flip)
        expect(Schema.is(ExecutionFailed)(protocol)).toBe(true)
        const unsupported = yield* sandbox.pause.pipe(Effect.flip)
        expect(Schema.is(Unsupported)(unsupported)).toBe(true)
      }),
    )
    mode = "unavailable"
    yield* Effect.scoped(
      Effect.gen(function* () {
        const sandbox = yield* provider.acquire()
        const failure = yield* sandbox.exec({ _tag: "Process", command: "true", arguments: [] }).pipe(Effect.flip)
        expect(Schema.is(Unavailable)(failure)).toBe(true)
      }),
    )
  }),
)

const spritesToken = Effect.runSync(
  Config.option(Config.string("SPRITES_TOKEN")).pipe(Effect.map(Option.getOrUndefined)),
)
const spritesApp = Effect.runSync(Config.option(Config.string("SPRITES_APP")).pipe(Effect.map(Option.getOrUndefined)))

describe.skipIf(spritesToken === undefined || spritesApp === undefined)("Fly Sprites live Sandbox", () => {
  if (spritesApp === undefined) return
  Testing.sandbox({
    name: "Fly Sprites",
    isolation: "microvm",
    layer: layer({ token: Config.redacted("SPRITES_TOKEN"), app: spritesApp }).pipe(
      Layer.provide(FetchHttpClient.layer),
    ),
  })
})
