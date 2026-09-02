import { layer as bunLayer } from "@effect/platform-bun/BunServices"
import { expect, layer } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path, Random, Schedule, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/unstable/http"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { build } from "esbuild"

const Probe = Schema.Struct({
  first: Schema.Struct({
    calls: Schema.Literal(1),
    processEnvironment: Schema.Tuple([]),
    processSpawn: Schema.Literal("undefined"),
    bun: Schema.Literal("undefined"),
    ambientSecret: Schema.Literal("undefined"),
    networkDenied: Schema.Literal(true),
  }),
  second: Schema.Struct({
    calls: Schema.Literal(1),
    processEnvironment: Schema.Tuple([]),
    processSpawn: Schema.Literal("undefined"),
    bun: Schema.Literal("undefined"),
    ambientSecret: Schema.Literal("undefined"),
    networkDenied: Schema.Literal(true),
  }),
})

layer(Layer.merge(bunLayer, FetchHttpClient.layer), { excludeTestServices: true, timeout: 60_000 })(
  "local workerd Worker Loader",
  (it) => {
    it.effect("loads fresh default-deny workers without ambient host objects", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem
          const path = yield* Path.Path
          const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
          const repositoryRoot = path.resolve(".")
          const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "generalist-worker-loader-" })
          const bundle = path.join(directory, "worker.js")
          const config = path.join(directory, "config.capnp")
          const port = yield* Random.nextIntBetween(20_000, 40_000, { halfOpen: true })

          yield* Effect.tryPromise(() =>
            build({
              entryPoints: [
                path.join(
                  repositoryRoot,
                  "packages/generalist/test/unstable/cloudflare/workerd/dynamic-loader-worker.ts",
                ),
              ],
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
  services = [(name = "main", worker = .worker)],
  sockets = [(name = "http", address = "127.0.0.1:${port}", http = (), service = "main")],
);

const worker :Workerd.Worker = (
  compatibilityDate = "2026-08-19",
  modules = [(name = "worker", esModule = embed "worker.js")],
  bindings = [(name = "LOADER", workerLoader = ())],
);
`,
          )

          yield* spawner.spawn(
            ChildProcess.make(
              path.join(repositoryRoot, "packages/generalist/node_modules/.bin/workerd"),
              ["serve", "--experimental", config],
              { cwd: directory, stderr: "inherit", stdout: "inherit" },
            ),
          )

          const response = yield* HttpClient.get(`http://127.0.0.1:${port}`).pipe(
            Effect.flatMap(HttpClientResponse.filterStatusOk),
            Effect.flatMap(HttpClientResponse.schemaBodyJson(Probe)),
            Effect.retry({ times: 100, schedule: Schedule.spaced("25 millis") }),
          )
          expect(response).toEqual({
            first: {
              calls: 1,
              processEnvironment: [],
              processSpawn: "undefined",
              bun: "undefined",
              ambientSecret: "undefined",
              networkDenied: true,
            },
            second: {
              calls: 1,
              processEnvironment: [],
              processSpawn: "undefined",
              bun: "undefined",
              ambientSecret: "undefined",
              networkDenied: true,
            },
          })
        }),
      ),
    )
  },
)
