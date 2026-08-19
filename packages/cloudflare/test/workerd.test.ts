import { layer as bunLayer } from "@effect/platform-bun/BunServices"
import { expect, layer } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path, Random, Schedule, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/unstable/http"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { build } from "esbuild"

const ConformanceResponse = Schema.Struct({
  backend: Schema.Literal("sqlite"),
  probe: Schema.Finite,
  tables: Schema.Array(Schema.String),
  committed: Schema.Literal(1),
  rolledBack: Schema.Literal(0),
  alarm: Schema.Literal(4_000_000_000_000),
  schemaVersion: Schema.Literal(8),
  migrations: Schema.Array(Schema.Struct({ id: Schema.Finite, name: Schema.String })),
})

const encodeString = Schema.encodeSync(Schema.fromJsonString(Schema.String))

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
  ],
  durableObjectStorage = (localDisk = "storage"),
  bindings = [(name = "SQL_OBJECTS", durableObjectNamespace = "SqlObject")],
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
              tables: expect.arrayContaining(["baton_runs", "baton_schema_meta"]),
              committed: 1,
              rolledBack: 0,
              alarm: 4_000_000_000_000,
              schemaVersion: 8,
              migrations: [{ id: 1, name: "baton_runtime" }],
            },
            {
              backend: "sqlite",
              probe: 2,
              tables: expect.arrayContaining(["baton_runs", "baton_schema_meta"]),
              committed: 1,
              rolledBack: 0,
              alarm: 4_000_000_000_000,
              schemaVersion: 8,
              migrations: [{ id: 1, name: "baton_runtime" }],
            },
          ])
        }),
      ),
    )
  },
)
