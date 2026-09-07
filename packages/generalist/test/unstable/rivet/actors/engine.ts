import { layer as nodeChildProcessSpawnerLayer } from "@effect/platform-node-shared/NodeChildProcessSpawner"
import { layer as nodeFileSystemLayer } from "@effect/platform-node-shared/NodeFileSystem"
import { layer as nodePathLayer } from "@effect/platform-node-shared/NodePath"
import { make as makeNodeSocketServer } from "@effect/platform-node-shared/NodeSocketServer"
import { Context, Effect, FileSystem, Layer, Path, Predicate, Schedule, Schema } from "effect"
import { FetchHttpClient, HttpClient } from "effect/unstable/http"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { createRequire } from "node:module"

class EngineUnavailable extends Schema.TaggedError<EngineUnavailable>()("generalist/test/RivetEngineUnavailable", {
  message: Schema.String,
}) {}

const EngineModule = Schema.Struct({
  getEnginePath: Schema.declare((value): value is () => string => Predicate.isFunction(value)),
})
const decodeEngineModule = Schema.decodeUnknownSync(EngineModule)

export class Engine extends Context.Service<
  Engine,
  {
    readonly endpoint: string
    readonly engineHost: string
    readonly enginePort: number
    readonly startServices: false
  }
>()("generalist/test/unstable/rivet/actors/engine") {}

const reservePort = Effect.gen(function* () {
  const server = yield* makeNodeSocketServer({ host: "127.0.0.1", port: 0 })
  if (server.address._tag !== "TcpAddress") {
    return yield* EngineUnavailable.make({ message: "Expected a local TCP listener" })
  }
  return server.address.port
})

export const layer = Layer.effect(
  Engine,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "generalist-rivet-engine-" })
    const sdkRequire = createRequire(createRequire(import.meta.url).resolve("rivetkit"))
    const module = yield* Effect.try({
      try: () => decodeEngineModule(sdkRequire("@rivetkit/engine-cli")),
      catch: () => EngineUnavailable.make({ message: "The installed Rivet SDK Engine binary is unavailable" }),
    })
    const binary = yield* Schema.decodeEffect(Schema.String)(
      yield* Effect.try({
        try: () => module.getEnginePath(),
        catch: () => EngineUnavailable.make({ message: "The installed Rivet SDK Engine binary could not be resolved" }),
      }),
    )
    const [enginePort, peerPort, metricsPort] = yield* Effect.scoped(
      Effect.all([reservePort, reservePort, reservePort]),
    )
    const process = yield* spawner.spawn(
      ChildProcess.make(binary, ["start"], {
        cwd: directory,
        env: {
          RIVET__FILE_SYSTEM__PATH: path.join(directory, "data"),
          RIVET__GUARD__HOST: "127.0.0.1",
          RIVET__GUARD__PORT: String(enginePort),
          RIVET__API_PEER__HOST: "127.0.0.1",
          RIVET__API_PEER__PORT: String(peerPort),
          RIVET__METRICS__HOST: "127.0.0.1",
          RIVET__METRICS__PORT: String(metricsPort),
          RIVET__TELEMETRY__ENABLED: "false",
          RIVET__FEATURES__GUARD_GATEWAY_V3__MODE: "on",
          RIVET__FEATURES__GUARD_GATEWAY_V3__PERCENTAGE: "100",
          RIVET__PEGBOARD__BASE_RETRY_TIMEOUT: "100",
          RIVET__PEGBOARD__ENVOY_ELIGIBLE_THRESHOLD: "5000",
          RIVET__PEGBOARD__ENVOY_LOST_THRESHOLD: "7000",
          RIVET__PEGBOARD__MIN_METADATA_POLL_INTERVAL: "1000",
          RIVET__PEGBOARD__RESCHEDULE_BACKOFF_MAX_EXPONENT: "1",
          RIVET__PEGBOARD__RETRY_RESET_DURATION: "100",
          RIVET__PEGBOARD__RUNNER_ELIGIBLE_THRESHOLD: "5000",
          RIVET__PEGBOARD__RUNNER_LOST_THRESHOLD: "7000",
          RIVET__RUNTIME__FORCE_SHUTDOWN_DURATION: "2",
          RIVET__RUNTIME__GUARD_SHUTDOWN_DURATION: "1",
          RIVET__RUNTIME__WORKER_SHUTDOWN_DURATION: "1",
        },
        stdout: "inherit",
        stderr: "inherit",
        forceKillAfter: "5 seconds",
      }),
    )
    const endpoint = `http://127.0.0.1:${enginePort}`
    const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk)
    yield* client.get(`${endpoint}/health`).pipe(
      Effect.flatMap((response) => response.text),
      Effect.retry({ times: 100, schedule: Schedule.spaced("100 millis") }),
    )
    if (!(yield* process.isRunning)) {
      return yield* EngineUnavailable.make({ message: "The owned Rivet Engine exited during startup" })
    }
    return Engine.of({ endpoint, engineHost: "127.0.0.1", enginePort, startServices: false })
  }),
).pipe(
  Layer.provide(
    Layer.merge(
      nodeChildProcessSpawnerLayer.pipe(Layer.provideMerge(Layer.merge(nodeFileSystemLayer, nodePathLayer))),
      FetchHttpClient.layer,
    ),
  ),
)
