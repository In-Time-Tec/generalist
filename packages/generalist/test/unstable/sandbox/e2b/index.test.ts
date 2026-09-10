import { describe, expect, it } from "@effect/vitest"
import { Config, Effect, Layer, Option, Redacted, Schema, Stream } from "effect"
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/unstable/http"
import { Testing } from "generalist/testing"
import { ExecutionFailed, SnapshotNotFound, Unavailable, Unsupported } from "../../../../src/sandbox/service.js"
import { layer, makeProvider } from "../../../../src/unstable/sandbox/e2b/index.js"

interface RecordedRequest {
  readonly method: string
  readonly url: string
  readonly headers: Readonly<Record<string, string | undefined>>
  readonly body: Schema.Json | undefined
  readonly connectFrame: { readonly flags: number; readonly length: number } | undefined
}

const jsonBody = (request: Parameters<Parameters<typeof HttpClient.make>[0]>[0]): Schema.Json | undefined => {
  if (request.body._tag !== "Uint8Array") return undefined
  const bytes = request.body.body
  const framed = request.headers["content-type"] === "application/connect+json"
  const encoded = new TextDecoder().decode(framed ? bytes.subarray(5) : bytes)
  const decoded = Schema.decodeOption(Schema.fromJsonString(Schema.Json))(encoded)
  return decoded._tag === "Some" ? decoded.value : encoded
}

const stringify = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

const response = (
  request: Parameters<Parameters<typeof HttpClient.make>[0]>[0],
  body?: string | Uint8Array<ArrayBuffer> | null,
  status = 200,
) => HttpClientResponse.fromWeb(request, new Response(body ?? null, { status }))

const connection = stringify({
  sandboxID: "sandbox-1",
  templateID: "generalist-bun",
  clientID: "client-1",
  envdVersion: "0.5.0",
  envdAccessToken: "envd-secret",
})

const connectFrames = (...frames: ReadonlyArray<readonly [number, Schema.Json]>): Uint8Array<ArrayBuffer> => {
  const encoded = frames.map(([flags, value]) => {
    const payload = new TextEncoder().encode(stringify(value))
    const frame = new Uint8Array(5 + payload.length)
    frame[0] = flags
    new DataView(frame.buffer).setUint32(1, payload.length)
    frame.set(payload, 5)
    return frame
  })
  const output = new Uint8Array(encoded.reduce((size, frame) => size + frame.length, 0))
  let offset = 0
  for (const frame of encoded) {
    output.set(frame, offset)
    offset += frame.length
  }
  return output
}

const processResponse = connectFrames(
  [0, { event: { start: { pid: 7 } } }],
  [0, { event: { data: { stdout: btoa("hello") } } }],
  [0, { event: { data: { stderr: btoa("warning") } } }],
  [0, { event: { end: { exited: true, status: "exit status 3" } } }],
  [2, {}],
)

it.effect("shapes E2B lifecycle, process, and filesystem requests", () =>
  Effect.gen(function* () {
    const requests: Array<RecordedRequest> = []
    const client = HttpClient.make((request, url) =>
      Effect.sync(() => {
        requests.push({
          method: request.method,
          url: url.toString(),
          headers: request.headers,
          body: jsonBody(request),
          connectFrame:
            request.body._tag === "Uint8Array" && request.headers["content-type"] === "application/connect+json"
              ? {
                  flags: request.body.body[0] ?? -1,
                  length: new DataView(request.body.body.buffer, request.body.body.byteOffset + 1, 4).getUint32(0),
                }
              : undefined,
        })
        if (url.pathname === "/sandboxes" && request.method === "POST") return response(request, connection, 201)
        if (url.pathname.endsWith("/connect")) return response(request, connection)
        if (url.pathname.endsWith("/pause")) return response(request, null, 204)
        if (url.pathname.endsWith("/snapshots"))
          return response(request, stringify({ snapshotID: "snapshot-1", names: ["snapshot-1"] }), 201)
        if (url.pathname === "/filesystem.Filesystem/MakeDir")
          return response(request, stringify({ entry: { name: "work", path: "/work" } }))
        if (url.pathname === "/files" && request.method === "GET") return response(request, "stored")
        if (url.pathname === "/files" && request.method === "POST") return response(request, stringify([]))
        if (url.pathname === "/process.Process/Start") return response(request, processResponse)
        return response(request, stringify({ code: 404, message: "missing fixture" }), 404)
      }),
    )
    const provider = yield* makeProvider({
      apiKey: Redacted.make("api-secret"),
      template: "generalist-bun",
    }).pipe(Effect.provideService(HttpClient.HttpClient, client))

    yield* Effect.scoped(
      Effect.gen(function* () {
        const sandbox = yield* provider.acquire()
        const files = yield* sandbox.files
        yield* files.makeDirectory("/work", { recursive: true })
        yield* files.writeFileString("/work/file.txt", "stored")
        expect(yield* files.readFileString("/work/file.txt")).toBe("stored")
        const result = yield* sandbox.exec({
          _tag: "Process",
          command: "printf",
          arguments: ["%s", "hello"],
          cwd: "/work",
          environment: { LANG: "C" },
        })
        expect(result).toEqual({ stdout: "hello", stderr: "warning", exitCode: 3 })
        expect(
          yield* Stream.runCollect(sandbox.stream({ _tag: "Process", command: "true", arguments: [] })),
        ).toHaveLength(2)
        expect(yield* sandbox.snapshot).toBe("snapshot-1")
        yield* sandbox.pause
        yield* sandbox.resume
      }),
    )

    const process = requests.find((request) => request.url.endsWith("/process.Process/Start"))
    expect(process).toBeDefined()
    if (process === undefined) return
    expect(process.headers["e2b-sandbox-id"]).toBe("sandbox-1")
    expect(process.headers["e2b-sandbox-port"]).toBe("49983")
    expect(process.headers["x-access-token"]).toBe("envd-secret")
    expect(process.headers["connect-protocol-version"]).toBe("1")
    expect(process.connectFrame).toEqual({
      flags: 0,
      length: new TextEncoder().encode(stringify(process.body)).length,
    })
    expect(process.body).toEqual({
      process: { cmd: "printf", args: ["%s", "hello"], cwd: "/work", envs: { LANG: "C" } },
      stdin: false,
    })
    const connect = requests.find((request) => request.url.endsWith("/connect"))
    expect(connect?.headers["x-api-key"]).toBe("api-secret")
    expect(connect?.body).toEqual({ timeout: 300 })
    expect(requests.find((request) => new URL(request.url).pathname === "/sandboxes")?.body).toEqual({
      templateID: "generalist-bun",
      timeout: 300,
      secure: true,
      allow_internet_access: true,
    })
    const mkdir = requests.find((request) => request.url.endsWith("/filesystem.Filesystem/MakeDir"))
    expect(mkdir?.headers["connect-protocol-version"]).toBe("1")
    expect(mkdir?.connectFrame).toEqual({ flags: 0, length: new TextEncoder().encode(stringify(mkdir?.body)).length })
    expect(mkdir?.body).toEqual({ path: "/work" })
    expect(requests.filter((request) => request.url.endsWith("/pause"))).toHaveLength(2)
  }),
)

it.effect("maps E2B provider, execution, snapshot, and unsupported failures", () =>
  Effect.gen(function* () {
    let creates = 0
    let processes = 0
    const client = HttpClient.make((request, url) =>
      Effect.sync(() => {
        if (url.pathname === "/sandboxes") {
          creates += 1
          return creates === 1
            ? response(request, connection, 201)
            : response(request, stringify({ code: 404, message: "snapshot missing" }), 404)
        }
        if (url.pathname === "/process.Process/Start") {
          processes += 1
          return processes === 1
            ? response(request, stringify({ code: 502, message: "envd unavailable" }), 502)
            : response(request, stringify({ code: 500, message: "process failed" }), 500)
        }
        if (url.pathname.endsWith("/pause")) return response(request, null, 204)
        return response(request, stringify({ code: 503, message: "capacity exhausted" }), 503)
      }),
    )
    const provider = yield* makeProvider({ apiKey: Redacted.make("key"), template: "generalist-bun" }).pipe(
      Effect.provideService(HttpClient.HttpClient, client),
    )
    yield* Effect.scoped(
      Effect.gen(function* () {
        const sandbox = yield* provider.acquire()
        const unavailable = yield* sandbox.exec({ _tag: "Process", command: "true", arguments: [] }).pipe(Effect.flip)
        expect(Schema.is(Unavailable)(unavailable)).toBe(true)
        const execution = yield* sandbox.exec({ _tag: "Process", command: "false", arguments: [] }).pipe(Effect.flip)
        expect(Schema.is(ExecutionFailed)(execution)).toBe(true)
        const snapshot = yield* sandbox.fork("missing-snapshot").pipe(Effect.flip)
        expect(Schema.is(SnapshotNotFound)(snapshot)).toBe(true)
        const unsupported = yield* sandbox.exec({ _tag: "TypeScript", cellId: "cell", source: "42" }).pipe(Effect.flip)
        expect(Schema.is(Unsupported)(unsupported)).toBe(true)
      }),
    )

    const unavailableClient = HttpClient.make((request) =>
      Effect.succeed(response(request, stringify({ code: 503, message: "capacity exhausted" }), 503)),
    )
    const unavailableProvider = yield* makeProvider({ apiKey: Redacted.make("key"), template: "generalist-bun" }).pipe(
      Effect.provideService(HttpClient.HttpClient, unavailableClient),
    )
    const failure = yield* Effect.scoped(unavailableProvider.acquire()).pipe(Effect.flip)
    expect(Schema.is(Unavailable)(failure)).toBe(true)
  }),
)

const e2bApiKey = Effect.runSync(Config.option(Config.string("E2B_API_KEY")).pipe(Effect.map(Option.getOrUndefined)))

describe.skipIf(e2bApiKey === undefined)("E2B live Sandbox", () => {
  Testing.sandbox({
    name: "E2B",
    isolation: "microvm",
    layer: layer({ apiKey: Config.redacted("E2B_API_KEY"), template: "generalist-bun" }).pipe(
      Layer.provide(FetchHttpClient.layer),
    ),
  })
})
