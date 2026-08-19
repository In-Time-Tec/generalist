import { layer as bunLayer } from "@effect/platform-bun/BunServices"
import { expect, layer } from "@effect/vitest"
import { Effect, Fiber, FileSystem, Layer, Path, Random, Schedule, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/unstable/http"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { build } from "esbuild"
import { encodeCommand, observerCodec } from "tenetkit/transport/wire"

const ConformanceResponse = Schema.Struct({
  backend: Schema.Literal("sqlite"),
  probe: Schema.Finite,
  tables: Schema.Array(Schema.String),
  committed: Schema.Literal(1),
  rolledBack: Schema.Literal(0),
  alarm: Schema.Literal(4_000_000_000_000),
  schemaVersion: Schema.Literal(1),
  migrations: Schema.Array(Schema.Struct({ id: Schema.Finite, name: Schema.String })),
})

const encodeString = Schema.encodeSync(Schema.fromJsonString(Schema.String))

const socketMessages = (socket: WebSocket, count: number): Effect.Effect<ReadonlyArray<string>> =>
  Effect.callback((resume) => {
    const messages: Array<string> = []
    socket.addEventListener("message", (event) => {
      messages.push(String(event.data))
      if (messages.length === count) resume(Effect.succeed(messages))
    })
    socket.addEventListener("error", () => resume(Effect.die("workerd WebSocket failed")), { once: true })
  })

layer(Layer.merge(bunLayer, FetchHttpClient.layer), { excludeTestServices: true, timeout: 60_000 })(
  "workerd conformance",
  (it) => {
    it.effect("executes Worker and SQLite Durable Object exports", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem
          const path = yield* Path.Path
          const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
          const repositoryRoot = path.resolve(".")
          const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "tenetkit-workerd-" })
          const bundle = path.join(directory, "worker.js")
          const config = path.join(directory, "config.capnp")
          const storage = path.join(directory, "storage")
          const port = yield* Random.nextIntBetween(20_000, 40_000, { halfOpen: true })

          yield* fileSystem.makeDirectory(storage)
          yield* Effect.tryPromise(() =>
            build({
              entryPoints: [path.join(repositoryRoot, "packages/cloudflare/test/workerd/worker.ts")],
              bundle: true,
              format: "esm",
              logLevel: "silent",
              outfile: bundle,
              platform: "browser",
              target: "es2022",
            }),
          )
          yield* fileSystem.writeFileString(
            config,
            `using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "main", worker = .worker),
    (name = "storage", disk = (path = ${encodeString(storage)}, writable = true)),
  ],
  sockets = [(name = "http", address = "127.0.0.1:${port}", http = (), service = "main")],
);

const worker :Workerd.Worker = (
  compatibilityDate = "2026-08-19",
  modules = [(name = "worker", esModule = embed "worker.js")],
  durableObjectNamespaces = [
    (className = "SqlObject", uniqueKey = "0123456789abcdef0123456789abcdef", enableSql = true),
    (className = "ReplayObject", uniqueKey = "abcdef0123456789abcdef0123456789", enableSql = true),
  ],
  durableObjectStorage = (localDisk = "storage"),
  bindings = [
    (name = "SQL_OBJECTS", durableObjectNamespace = "SqlObject"),
    (name = "REPLAY_OBJECTS", durableObjectNamespace = "ReplayObject"),
  ],
);
`,
          )

          yield* spawner.spawn(
            ChildProcess.make(
              path.join(repositoryRoot, "packages/cloudflare/node_modules/.bin/workerd"),
              ["serve", config],
              { cwd: directory, stderr: "inherit", stdout: "inherit" },
            ),
          )

          const request = HttpClient.get(`http://127.0.0.1:${port}`).pipe(
            Effect.flatMap(HttpClientResponse.filterStatusOk),
            Effect.flatMap(HttpClientResponse.schemaBodyJson(ConformanceResponse)),
            Effect.retry({ times: 100, schedule: Schedule.spaced("25 millis") }),
          )
          const responses = yield* Effect.forEach([1, 2], () => request)

          expect(responses).toEqual([
            {
              backend: "sqlite",
              probe: 1,
              tables: expect.arrayContaining(["tenetkit_runs", "tenetkit_schema_meta"]),
              committed: 1,
              rolledBack: 0,
              alarm: 4_000_000_000_000,
              schemaVersion: 1,
              migrations: [{ id: 1, name: "tenetkit_runtime" }],
            },
            {
              backend: "sqlite",
              probe: 2,
              tables: expect.arrayContaining(["tenetkit_runs", "tenetkit_schema_meta"]),
              committed: 1,
              rolledBack: 0,
              alarm: 4_000_000_000_000,
              schemaVersion: 1,
              migrations: [{ id: 1, name: "tenetkit_runtime" }],
            },
          ])

          const socket = yield* Effect.callback<WebSocket>((resume) => {
            const candidate = new WebSocket(`ws://127.0.0.1:${port}/replay`)
            candidate.addEventListener("open", () => resume(Effect.succeed(candidate)), { once: true })
            candidate.addEventListener("error", () => resume(Effect.die("workerd WebSocket failed")), { once: true })
          }).pipe(Effect.timeout("5 seconds"))
          const first = yield* socketMessages(socket, 1).pipe(Effect.forkChild)
          socket.send(yield* encodeCommand({ _tag: "Attach", runId: "replay-run" }))
          const firstMessages = yield* Fiber.join(first).pipe(Effect.timeout("5 seconds"))
          expect((yield* observerCodec.decode(firstMessages[0]!)).sequence).toBe(0)

          const second = yield* socketMessages(socket, 1).pipe(Effect.forkChild)
          yield* HttpClient.get(`http://127.0.0.1:${port}/replay/flush`).pipe(
            Effect.flatMap(HttpClientResponse.filterStatusOk),
          )
          const secondMessages = yield* Fiber.join(second).pipe(Effect.timeout("5 seconds"))
          expect((yield* observerCodec.decode(secondMessages[0]!)).sequence).toBe(1)
          const closed = Effect.callback<void>((resume) => {
            socket.addEventListener("close", () => resume(Effect.void), { once: true })
          })
          socket.close()
          yield* closed.pipe(Effect.timeout("5 seconds"))
        }),
      ),
    )
  },
)
