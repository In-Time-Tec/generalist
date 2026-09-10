import { describe, expect, it } from "@effect/vitest"
import { InternalFailure } from "modal"
import { Config, Effect, Layer, Option, Redacted, Schema } from "effect"
import { Testing } from "generalist/testing"
import { ExecutionFailed, SandboxProvider, Unavailable, Unsupported } from "../../../../src/sandbox/service.js"
import {
  type Client,
  type Connection,
  layer,
  makeProvider,
  type ProviderOptions,
} from "../../../../src/unstable/sandbox/modal/index.js"

class FixtureClient implements Client {
  readonly calls: Array<readonly [string, ...ReadonlyArray<unknown>]> = []
  readonly connections = new Map<string, FixtureConnection>()
  readonly snapshots = new Map<string, Map<string, string>>()
  nextId = 0

  create(image: string, snapshot: boolean): Promise<Connection> {
    this.calls.push(["create", image, snapshot])
    const files = snapshot ? new Map(this.snapshots.get(image) ?? []) : new Map<string, string>()
    const connection = new FixtureConnection(this, `modal-${++this.nextId}`, files)
    this.connections.set(connection.id, connection)
    return Promise.resolve(connection)
  }

  connect(id: string): Promise<Connection> {
    this.calls.push(["connect", id])
    const connection = this.connections.get(id)
    return connection === undefined ? Promise.reject(new Error("missing Modal Sandbox")) : Promise.resolve(connection)
  }

  close(): void {
    this.calls.push(["close"])
  }
}

class FixtureConnection implements Connection {
  constructor(
    readonly client: FixtureClient,
    readonly id: string,
    readonly files: Map<string, string>,
  ) {}

  execute(command: ReadonlyArray<string>, options: Parameters<Connection["execute"]>[1]) {
    this.client.calls.push(["execute", this.id, command, options])
    if (command[0] === "unavailable") return Promise.reject(new InternalFailure("Modal capacity unavailable"))
    if (command[0] === "failure") return Promise.reject(new Error("invalid command"))
    const stdout = command[0] === "printf" ? (command.at(-1) ?? "") : ""
    const result = { stdout, stderr: "", exitCode: 0 }
    return command[0] === "sleep"
      ? Effect.runPromise(Effect.sleep("100 millis")).then(() => result)
      : Promise.resolve(result)
  }

  makeDirectory(path: string) {
    this.client.calls.push(["makeDirectory", this.id, path])
    return Promise.resolve()
  }

  readFile(path: string) {
    this.client.calls.push(["readFile", this.id, path])
    return Promise.resolve(this.files.get(path) ?? "")
  }

  writeFile(path: string, data: string) {
    this.client.calls.push(["writeFile", this.id, path, data])
    this.files.set(path, data)
    return Promise.resolve()
  }

  snapshot() {
    const id = `image-${this.client.snapshots.size + 1}`
    this.client.calls.push(["snapshot", this.id, id])
    this.client.snapshots.set(id, new Map(this.files))
    return Promise.resolve(id)
  }

  terminate() {
    this.client.calls.push(["terminate", this.id])
    this.client.connections.delete(this.id)
    return Promise.resolve()
  }

  detach() {
    this.client.calls.push(["detach", this.id])
  }
}

const options = (client: Client): ProviderOptions => ({
  tokenId: Redacted.make("modal-id"),
  tokenSecret: Redacted.make("modal-secret"),
  app: "generalist",
  image: "ubuntu:24.04",
  client,
})

const recordedLayer = () => {
  const client = new FixtureClient()
  return Layer.succeed(SandboxProvider, makeProvider(options(client)))
}

Testing.sandbox({ name: "Modal recorded", isolation: "container", layer: recordedLayer() })

it.effect("maps Modal command options and terminates fresh sandboxes", () =>
  Effect.gen(function* () {
    const client = new FixtureClient()
    const provider = makeProvider(options(client))
    yield* Effect.scoped(
      Effect.gen(function* () {
        const sandbox = yield* provider.acquire()
        expect(sandbox.isolation).toBe("container")
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
    expect(client.calls[0]).toEqual(["create", "ubuntu:24.04", false])
    expect(client.calls.find(([name]) => name === "execute")).toEqual([
      "execute",
      "modal-1",
      ["printf", "%s", "hello"],
      { cwd: "/work", environment: { LANG: "C" }, stdin: "input" },
    ])
    expect(client.calls.at(-1)).toEqual(["terminate", "modal-1"])
  }),
)

it.effect("detaches keyed Modal sandboxes without terminating them", () =>
  Effect.gen(function* () {
    const client = new FixtureClient()
    const existing = yield* Effect.promise(() => client.create("ubuntu:24.04", false))
    const provider = makeProvider(options(client))
    yield* Effect.scoped(provider.acquire({ key: existing.id }))
    expect(client.calls.at(-1)).toEqual(["detach", existing.id])
    expect(client.connections.has(existing.id)).toBe(true)
  }),
)

it.effect("maps Modal acquisition, execution, and unsupported failures", () =>
  Effect.gen(function* () {
    const client = new FixtureClient()
    const provider = makeProvider(options(client))
    const unavailable = yield* Effect.scoped(provider.acquire({ key: "missing" })).pipe(Effect.flip)
    expect(Schema.is(Unavailable)(unavailable)).toBe(true)
    yield* Effect.scoped(
      Effect.gen(function* () {
        const sandbox = yield* provider.acquire()
        const failed = yield* sandbox.exec({ _tag: "Process", command: "failure", arguments: [] }).pipe(Effect.flip)
        expect(Schema.is(ExecutionFailed)(failed)).toBe(true)
        const disconnected = yield* sandbox
          .exec({ _tag: "Process", command: "unavailable", arguments: [] })
          .pipe(Effect.flip)
        expect(Schema.is(Unavailable)(disconnected)).toBe(true)
        const unsupported = yield* sandbox.pause.pipe(Effect.flip)
        expect(Schema.is(Unsupported)(unsupported)).toBe(true)
      }),
    )
  }),
)

const modalTokenId = Effect.runSync(
  Config.option(Config.string("MODAL_TOKEN_ID")).pipe(Effect.map(Option.getOrUndefined)),
)
const modalTokenSecret = Effect.runSync(
  Config.option(Config.string("MODAL_TOKEN_SECRET")).pipe(Effect.map(Option.getOrUndefined)),
)
const modalApp = Effect.runSync(Config.option(Config.string("MODAL_APP")).pipe(Effect.map(Option.getOrUndefined)))

describe.skipIf(modalTokenId === undefined || modalTokenSecret === undefined || modalApp === undefined)(
  "Modal live Sandbox",
  () => {
    if (modalApp === undefined) return
    Testing.sandbox({
      name: "Modal",
      isolation: "container",
      layer: layer({
        tokenId: Config.redacted("MODAL_TOKEN_ID"),
        tokenSecret: Config.redacted("MODAL_TOKEN_SECRET"),
        app: modalApp,
        image: "ubuntu:24.04",
      }),
    })
  },
)
