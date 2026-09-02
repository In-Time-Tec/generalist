import { describe, expect, it } from "@effect/vitest"
import { Config, Effect, Layer, Option, Redacted, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/unstable/http"
import { Testing } from "generalist/testing"
import { ExecutionFailed, SandboxProvider, Unavailable, Unsupported } from "../../../../src/sandbox/service.js"
import {
  layer,
  makeProvider,
  type ProviderOptions,
  type SandboxClass,
} from "../../../../src/unstable/sandbox/daytona/index.js"

interface RecordedRequest {
  readonly method: string
  readonly url: string
  readonly headers: Readonly<Record<string, string | undefined>>
  readonly body: Schema.Json | undefined
}

const jsonBody = (request: Parameters<Parameters<typeof HttpClient.make>[0]>[0]): Schema.Json | undefined => {
  if (request.body._tag !== "Uint8Array") return undefined
  return Schema.decodeSync(Schema.fromJsonString(Schema.Json))(new TextDecoder().decode(request.body.body))
}

const response = (
  request: Parameters<Parameters<typeof HttpClient.make>[0]>[0],
  body?: Schema.Json | null,
  status = 200,
) =>
  HttpClientResponse.fromWeb(
    request,
    new Response(body === undefined || body === null ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  )

const connection = (sandboxClass: SandboxClass) => ({
  id: `daytona-${sandboxClass}`,
  toolboxProxyUrl: "https://proxy.app.daytona.io/toolbox",
  sandboxClass,
  state: "started",
})

const fixture = (sandboxClass: SandboxClass, requests: Array<RecordedRequest> = []) => {
  const files = new Map<string, string>()
  return HttpClient.make((request, url) => {
    const body = jsonBody(request)
    requests.push({ method: request.method, url: url.toString(), headers: request.headers, body })
    if (url.pathname === "/api/sandbox" && request.method === "POST")
      return Effect.succeed(response(request, connection(sandboxClass)))
    if (url.pathname.startsWith("/api/sandbox/")) return Effect.succeed(response(request, connection(sandboxClass)))
    if (!url.pathname.endsWith("/process/execute"))
      return Effect.succeed(response(request, { message: "missing fixture" }, 404))
    const decoded = Schema.decodeUnknownSync(
      Schema.Struct({
        command: Schema.String,
        cwd: Schema.optionalKey(Schema.String),
        envs: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
        timeout: Schema.optionalKey(Schema.Int),
      }),
    )(body)
    const quoted = Array.from(decoded.command.matchAll(/'([^']*)'/g), (match) => match[1] ?? "")
    if (decoded.command.startsWith("mkdir -p") && decoded.command.includes("printf %s")) {
      const path = quoted.at(-1) ?? ""
      const data = quoted.at(-2) ?? ""
      files.set(path, data)
      return Effect.succeed(response(request, { result: "", exitCode: 0 }))
    }
    if (decoded.command.startsWith("cat --"))
      return Effect.succeed(response(request, { result: files.get(quoted[0] ?? "") ?? "", exitCode: 0 }))
    if (decoded.command.includes("'sleep'"))
      return Effect.sleep("100 millis").pipe(Effect.as(response(request, { result: "", exitCode: 0 })))
    const output = quoted.includes("printf") ? (quoted.at(-1) ?? "") : ""
    return Effect.succeed(response(request, { result: output, exitCode: 0 }))
  })
}

const recordedLayer = (sandboxClass: SandboxClass) => {
  const options: ProviderOptions = {
    apiKey: Redacted.make("daytona-secret"),
    image: sandboxClass === "container" ? "ubuntu:22.04" : "daytona-vm-small",
    sandboxClass,
  }
  return Layer.effect(
    SandboxProvider,
    makeProvider(options).pipe(Effect.provideService(HttpClient.HttpClient, fixture(sandboxClass))),
  )
}

Testing.sandbox({ name: "Daytona container recorded", isolation: "container", layer: recordedLayer("container") })
Testing.sandbox({ name: "Daytona Linux VM recorded", isolation: "microvm", layer: recordedLayer("linux-vm") })

it.effect("shapes Daytona create, command, and VM lifecycle requests", () =>
  Effect.gen(function* () {
    const requests: Array<RecordedRequest> = []
    const provider = yield* makeProvider({
      apiKey: Redacted.make("daytona-secret"),
      image: "daytona-vm-small",
      sandboxClass: "linux-vm",
    }).pipe(Effect.provideService(HttpClient.HttpClient, fixture("linux-vm", requests)))
    yield* Effect.scoped(
      Effect.gen(function* () {
        const sandbox = yield* provider.acquire()
        expect(sandbox.isolation).toBe("microvm")
        expect(sandbox.capabilities.pause).toBe(true)
        const result = yield* sandbox.exec({
          _tag: "Process",
          command: "printf",
          arguments: ["%s", "hello"],
          cwd: "/work",
          environment: { LANG: "C" },
          stdin: "input",
        })
        expect(result).toEqual({ stdout: "hello", stderr: "", exitCode: 0 })
        yield* sandbox.pause
        yield* sandbox.resume
      }),
    )
    expect(requests[0]?.headers.authorization).toBe("Bearer daytona-secret")
    expect(requests[0]?.body).toEqual({
      autoStopInterval: 0,
      autoPauseInterval: 0,
      snapshot: "daytona-vm-small",
    })
    const execution = requests.find((item) => item.url.endsWith("/process/execute"))
    expect(execution?.body).toEqual({
      command: `printf %s 'input' | 'printf' '%s' 'hello'`,
      cwd: "/work",
      envs: { LANG: "C" },
    })
    expect(requests.filter((item) => item.url.endsWith("/pause"))).toHaveLength(1)
    expect(requests.filter((item) => item.url.endsWith("/start"))).toHaveLength(1)
    expect(requests.at(-1)?.method).toBe("DELETE")
  }),
)

it.effect("preserves keyed Daytona sandboxes when their acquisition scope closes", () =>
  Effect.gen(function* () {
    const requests: Array<RecordedRequest> = []
    const provider = yield* makeProvider({
      apiKey: Redacted.make("daytona-secret"),
      image: "daytona-vm-small",
      sandboxClass: "linux-vm",
    }).pipe(Effect.provideService(HttpClient.HttpClient, fixture("linux-vm", requests)))
    yield* Effect.scoped(provider.acquire({ key: "daytona-linux-vm" }))
    expect(requests[0]?.method).toBe("GET")
    expect(requests.at(-1)?.url).toMatch(/\/pause$/)
    expect(requests.some((item) => item.method === "DELETE")).toBe(false)
  }),
)

it.effect("rejects a mismatching Daytona class and maps command failures", () =>
  Effect.gen(function* () {
    let mode: "class" | "unavailable" | "execution" = "class"
    const client = HttpClient.make((request, url) => {
      if (url.pathname === "/api/sandbox")
        return Effect.succeed(response(request, connection(mode === "class" ? "container" : "linux-vm")))
      if (url.pathname.endsWith("/pause")) return Effect.succeed(response(request, connection("linux-vm")))
      return Effect.succeed(
        response(
          request,
          { message: mode === "unavailable" ? "capacity exhausted" : "invalid command" },
          mode === "unavailable" ? 503 : 400,
        ),
      )
    })
    const provider = yield* makeProvider({
      apiKey: Redacted.make("key"),
      image: "daytona-vm-small",
      sandboxClass: "linux-vm",
    }).pipe(Effect.provideService(HttpClient.HttpClient, client))
    const classFailure = yield* Effect.scoped(provider.acquire()).pipe(Effect.flip)
    expect(Schema.is(Unavailable)(classFailure)).toBe(true)

    mode = "unavailable"
    yield* Effect.scoped(
      Effect.gen(function* () {
        const sandbox = yield* provider.acquire()
        const failure = yield* sandbox.exec({ _tag: "Process", command: "true", arguments: [] }).pipe(Effect.flip)
        expect(Schema.is(Unavailable)(failure)).toBe(true)
      }),
    )

    mode = "execution"
    yield* Effect.scoped(
      Effect.gen(function* () {
        const sandbox = yield* provider.acquire()
        const failure = yield* sandbox.exec({ _tag: "Process", command: "false", arguments: [] }).pipe(Effect.flip)
        expect(Schema.is(ExecutionFailed)(failure)).toBe(true)
        const unsupported = yield* sandbox.snapshot.pipe(Effect.flip)
        expect(Schema.is(Unsupported)(unsupported)).toBe(true)
      }),
    )
  }),
)

const daytonaApiKey = Effect.runSync(
  Config.option(Config.string("DAYTONA_API_KEY")).pipe(Effect.map(Option.getOrUndefined)),
)

describe.skipIf(daytonaApiKey === undefined)("Daytona live Sandbox", () => {
  Testing.sandbox({
    name: "Daytona container",
    isolation: "container",
    layer: layer({
      apiKey: Config.redacted("DAYTONA_API_KEY"),
      image: "ubuntu:22.04",
      sandboxClass: "container",
    }).pipe(Layer.provide(FetchHttpClient.layer)),
  })
})
