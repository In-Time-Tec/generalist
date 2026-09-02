import { describe, expect, it } from "@effect/vitest"
import { Config, Effect, Layer, Option, Redacted, Schema, type Types } from "effect"
import { Testing } from "generalist/testing"
import {
  ExecutionFailed,
  LimitExceeded,
  SandboxProvider,
  Unavailable,
  Unsupported,
} from "../../../../src/sandbox/service.js"
import {
  type Actor,
  type Client,
  layer,
  makeProvider,
  type Options,
  type ProviderOptions,
} from "../../../../src/unstable/sandbox/agentos/index.js"

class FixtureActor implements Actor {
  readonly files = new Map<string, string>()

  constructor(
    readonly client: FixtureClient,
    readonly key: string,
  ) {}

  health() {
    this.client.calls.push(["action", this.key, "health", []])
    return Promise.resolve()
  }

  destroy() {
    this.client.calls.push(["action", this.key, "destroy", []])
    this.client.actors.delete(this.key)
    return Promise.resolve()
  }

  execute(command: string, arguments_: ReadonlyArray<string>, options: Parameters<Actor["execute"]>[2]) {
    this.client.calls.push(["action", this.key, "execArgv", [command, arguments_, options]])
    if (command === "unavailable") return Promise.reject(new Error("network connection unavailable"))
    if (command === "cpu-limit") return Promise.reject(new Error("CPU time limit exceeded"))
    if (command === "failure") return Promise.reject(new Error("invalid command"))
    const stdout = command === "printf" ? (arguments_.at(-1) ?? "") : ""
    const result = { stdout, stderr: "", exitCode: 0 }
    return command === "sleep"
      ? Effect.runPromise(Effect.sleep("100 millis")).then(() => result)
      : Promise.resolve(result)
  }

  makeDirectory(path: string) {
    this.client.calls.push(["action", this.key, "mkdir", [path, { recursive: true }]])
    return Promise.resolve()
  }

  readFile(path: string) {
    this.client.calls.push(["action", this.key, "readFile", [path]])
    return Promise.resolve(new TextEncoder().encode(this.files.get(path) ?? ""))
  }

  writeFile(path: string, data: string) {
    this.client.calls.push(["action", this.key, "writeFile", [path, data]])
    this.files.set(path, data)
    return Promise.resolve()
  }
}

class FixtureClient implements Client {
  readonly calls: Array<readonly [string, ...ReadonlyArray<unknown>]> = []
  readonly actors = new Map<string, FixtureActor>()

  create(name: string, key: string): Promise<Actor> {
    this.calls.push(["create", name, key])
    const actor = new FixtureActor(this, key)
    this.actors.set(key, actor)
    return Promise.resolve(actor)
  }

  get(name: string, key: string): Actor {
    this.calls.push(["get", name, key])
    const actor = this.actors.get(key)
    if (actor === undefined) {
      const missing = () => Promise.reject(new Error("missing actor"))
      return {
        health: missing,
        destroy: missing,
        execute: missing,
        makeDirectory: missing,
        readFile: missing,
        writeFile: missing,
      }
    }
    return actor
  }

  close(): Promise<void> {
    this.calls.push(["close"])
    return Promise.resolve()
  }
}

const options = (client: Client): ProviderOptions => ({
  endpoint: "https://agentos.example.test",
  token: Redacted.make("agentos-secret"),
  actor: "vm",
  client,
})

const recordedLayer = () => {
  const client = new FixtureClient()
  return Layer.effect(SandboxProvider, makeProvider(options(client)))
}

Testing.sandbox({ name: "agentOS recorded", isolation: "v8-isolate", layer: recordedLayer() })

it.effect("calls agentOS argv and filesystem actions and destroys fresh actors", () =>
  Effect.gen(function* () {
    const client = new FixtureClient()
    const provider = yield* makeProvider(options(client))
    yield* Effect.scoped(
      Effect.gen(function* () {
        const sandbox = yield* provider.acquire({ limits: { cpuMs: 50 } })
        expect(sandbox.isolation).toBe("v8-isolate")
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
    expect(client.calls[0]?.slice(0, 2)).toEqual(["create", "vm"])
    const execution = client.calls.find((call) => call[0] === "action" && call[2] === "execArgv")
    expect(execution?.[3]).toEqual([
      "printf",
      ["%s", "hello"],
      { captureStdio: true, cpuTimeLimitMs: 50, cwd: "/work", env: { LANG: "C" }, stdin: "input" },
    ])
    expect(client.calls.at(-1)?.slice(0, 3)).toEqual(["action", expect.any(String), "destroy"])
    expect(client.actors.size).toBe(0)
  }),
)

it.effect("preserves keyed agentOS actors when their acquisition scope closes", () =>
  Effect.gen(function* () {
    const client = new FixtureClient()
    yield* Effect.promise(() => client.create("vm", "existing"))
    const provider = yield* makeProvider(options(client))
    yield* Effect.scoped(provider.acquire({ key: "existing" }))
    expect(client.actors.has("existing")).toBe(true)
    expect(client.calls.some((call) => call[2] === "destroy")).toBe(false)
  }),
)

it.effect("maps agentOS acquisition, execution, and unsupported failures", () =>
  Effect.gen(function* () {
    const client = new FixtureClient()
    const provider = yield* makeProvider(options(client))
    const unavailable = yield* Effect.scoped(provider.acquire({ key: "missing" })).pipe(Effect.flip)
    expect(Schema.is(Unavailable)(unavailable)).toBe(true)
    yield* Effect.scoped(
      Effect.gen(function* () {
        const sandbox = yield* provider.acquire({ limits: { cpuMs: 50 } })
        const failed = yield* sandbox.exec({ _tag: "Process", command: "failure", arguments: [] }).pipe(Effect.flip)
        expect(Schema.is(ExecutionFailed)(failed)).toBe(true)
        const disconnected = yield* sandbox
          .exec({ _tag: "Process", command: "unavailable", arguments: [] })
          .pipe(Effect.flip)
        expect(Schema.is(Unavailable)(disconnected)).toBe(true)
        const cpu = yield* sandbox.exec({ _tag: "Process", command: "cpu-limit", arguments: [] }).pipe(Effect.flip)
        expect(Schema.is(LimitExceeded)(cpu)).toBe(true)
        expect(cpu).toMatchObject({ resource: "cpu", limit: 50 })
        const unsupported = yield* sandbox.snapshot.pipe(Effect.flip)
        expect(Schema.is(Unsupported)(unsupported)).toBe(true)
      }),
    )
  }),
)

const agentosEndpoint = Effect.runSync(
  Config.option(Config.string("AGENTOS_ENDPOINT")).pipe(Effect.map(Option.getOrUndefined)),
)
const agentosToken = Effect.runSync(
  Config.option(Config.string("AGENTOS_TOKEN")).pipe(Effect.map(Option.getOrUndefined)),
)
const agentosActor = Effect.runSync(
  Config.option(Config.string("AGENTOS_ACTOR")).pipe(Effect.map(Option.getOrUndefined)),
)

describe.skipIf(agentosEndpoint === undefined || agentosToken === undefined)("agentOS live Sandbox", () => {
  if (agentosEndpoint === undefined) return
  const liveOptions: Types.Mutable<Options> = {
    endpoint: agentosEndpoint,
    token: Config.redacted("AGENTOS_TOKEN"),
  }
  if (agentosActor !== undefined) liveOptions.actor = agentosActor
  Testing.sandbox({
    name: "agentOS",
    isolation: "v8-isolate",
    layer: layer(liveOptions),
  })
})
