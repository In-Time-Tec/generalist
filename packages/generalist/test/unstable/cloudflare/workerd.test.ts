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
  cancellationStoredType: Schema.Literal("integer"),
  cancellationStoredValue: Schema.Literal(1),
  cancellationTerminalStatus: Schema.Literal("cancelled"),
  alarm: Schema.Literal(4_000_000_000_000),
  schemaVersion: Schema.Literal(9),
  logicalSchemaViolations: Schema.Array(Schema.String),
  migrations: Schema.Array(Schema.Struct({ id: Schema.Finite, name: Schema.String })),
  transitionAffected: Schema.Tuple([Schema.Literal(1), Schema.Literal(0)]),
  pluralInitialOrder: Schema.Tuple([Schema.Literal("a"), Schema.Literal("b"), Schema.Literal("c")]),
  pluralRemainingAfterOutOfOrder: Schema.Tuple([Schema.Literal("b")]),
  pluralConflictingTag: Schema.Literal("generalist/runtime/ResponseConflict"),
  pluralFinalOpen: Schema.Literal(0),
  pluralResumeEvents: Schema.Literal(3),
  pluralAuthoredHistory: Schema.Tuple([Schema.Literal("a"), Schema.Literal("b"), Schema.Literal("c")]),
  acknowledgementInitialSequence: Schema.Literal(-1),
  acknowledgedSequence: Schema.Finite,
  acknowledgementInvalidTag: Schema.Literal("generalist/runtime/AckInvalid"),
  acknowledgementBeyondTag: Schema.Literal("generalist/runtime/AckBeyondCommitted"),
  acknowledgementTailSequences: Schema.Tuple([Schema.Finite]),
})

const AgentConformanceResponse = Schema.Struct({
  objective: Schema.Literal("Arrange service"),
  facts: Schema.Array(Schema.Literal("Provider serves Boise")),
  lookupExecutions: Schema.Literal(1),
  denied: Schema.Literal(true),
  deniedExecutions: Schema.Literal(0),
  budgetExhausted: Schema.Literal(true),
  budgetModelRequests: Schema.Literal(1),
  openRouterBundled: Schema.Literal(true),
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
          const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "generalist-workerd-" })
          const bundle = path.join(directory, "worker.js")
          const config = path.join(directory, "config.capnp")
          const storage = path.join(directory, "storage")
          const port = yield* Random.nextIntBetween(20_000, 40_000, { halfOpen: true })

          yield* fileSystem.makeDirectory(storage)
          yield* Effect.tryPromise(() =>
            build({
              entryPoints: [
                path.join(repositoryRoot, "packages/generalist/test/unstable/cloudflare/workerd/worker.ts"),
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
  bindings = [
    (name = "SQL_OBJECTS", durableObjectNamespace = "SqlObject"),
  ],
);
`,
          )

          yield* spawner.spawn(
            ChildProcess.make(
              path.join(repositoryRoot, "packages/generalist/node_modules/.bin/workerd"),
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
              tables: responses[0]?.tables,
              committed: 1,
              rolledBack: 0,
              cancellationStoredType: "integer",
              cancellationStoredValue: 1,
              cancellationTerminalStatus: "cancelled",
              alarm: 4_000_000_000_000,
              schemaVersion: 9,
              logicalSchemaViolations: [],
              migrations: [{ id: 1, name: "generalist_runtime" }],
              transitionAffected: [1, 0],
              pluralInitialOrder: ["a", "b", "c"],
              pluralRemainingAfterOutOfOrder: ["b"],
              pluralConflictingTag: "generalist/runtime/ResponseConflict",
              pluralFinalOpen: 0,
              pluralResumeEvents: 3,
              pluralAuthoredHistory: ["a", "b", "c"],
              acknowledgementInitialSequence: -1,
              acknowledgedSequence: responses[0]!.acknowledgedSequence,
              acknowledgementInvalidTag: "generalist/runtime/AckInvalid",
              acknowledgementBeyondTag: "generalist/runtime/AckBeyondCommitted",
              acknowledgementTailSequences: [responses[0]!.acknowledgedSequence + 1],
            },
            {
              backend: "sqlite",
              probe: 2,
              tables: responses[1]?.tables,
              committed: 1,
              rolledBack: 0,
              cancellationStoredType: "integer",
              cancellationStoredValue: 1,
              cancellationTerminalStatus: "cancelled",
              alarm: 4_000_000_000_000,
              schemaVersion: 9,
              logicalSchemaViolations: [],
              migrations: [{ id: 1, name: "generalist_runtime" }],
              transitionAffected: [1, 0],
              pluralInitialOrder: ["a", "b", "c"],
              pluralRemainingAfterOutOfOrder: ["b"],
              pluralConflictingTag: "generalist/runtime/ResponseConflict",
              pluralFinalOpen: 0,
              pluralResumeEvents: 3,
              pluralAuthoredHistory: ["a", "b", "c"],
              acknowledgementInitialSequence: -1,
              acknowledgedSequence: responses[1]!.acknowledgedSequence,
              acknowledgementInvalidTag: "generalist/runtime/AckInvalid",
              acknowledgementBeyondTag: "generalist/runtime/AckBeyondCommitted",
              acknowledgementTailSequences: [responses[1]!.acknowledgedSequence + 1],
            },
          ])
          for (const response of responses) {
            expect(response.tables).toEqual(
              expect.arrayContaining(["generalist_runs", "generalist_run_acknowledgements", "generalist_schema_meta"]),
            )
          }

          const agentResponse = yield* HttpClient.get(`http://127.0.0.1:${port}/agent`).pipe(
            Effect.flatMap(HttpClientResponse.filterStatusOk),
            Effect.flatMap(HttpClientResponse.schemaBodyJson(AgentConformanceResponse)),
          )
          expect(agentResponse).toEqual({
            objective: "Arrange service",
            facts: ["Provider serves Boise"],
            lookupExecutions: 1,
            denied: true,
            deniedExecutions: 0,
            budgetExhausted: true,
            budgetModelRequests: 1,
            openRouterBundled: true,
          })
        }),
      ),
    )
  },
)
