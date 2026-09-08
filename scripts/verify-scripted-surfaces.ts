/* oxlint-disable effecttsgo/strict-effect-provide -- this script is an application entry point. */
import { BunCrypto } from "@effect/platform-bun"
import { layer } from "@effect/platform-bun/BunServices"
import { make as makeNodeSocketServer } from "@effect/platform-node-shared/NodeSocketServer"
import {
  Console,
  Crypto,
  Effect,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Ref,
  Result,
  Schedule,
  Schema,
  Stream,
} from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { credentials, type LocalS3, withMinio } from "../packages/generalist/test/durability/local-minio.js"

class ScriptedSurfaceFailed extends Schema.TaggedError<ScriptedSurfaceFailed>()(
  "generalist/scripts/ScriptedSurfaceFailed",
  { message: Schema.String },
) {}

export interface Target {
  readonly label: string
  readonly args: ReadonlyArray<string>
  readonly cwd: string
  readonly server?: "deep-research-agent" | "mcp-toolkit-server"
}

const PackageManifest = Schema.Struct({
  scripts: Schema.optionalKey(Schema.Struct({ start: Schema.optionalKey(Schema.String) })),
})

const skippedExamples = new Map([
  ["memory", "requires SUPERMEMORY_API_KEY and model credentials"],
  ["package-catalog", "requires the documented local npm registry and unpublished reference package"],
])

const skippedSnippets = new Map([
  ["examples/docs-snippets/guides/agent/middleware/resilience.ts", "requires OPENROUTER_API_KEY"],
  ["examples/docs-snippets/guides/runtime/providers/combine-providers.ts", "requires provider credentials"],
  ["examples/docs-snippets/guides/runtime/providers/gemini-openai-compat.ts", "requires GOOGLE_AI_STUDIO_API_KEY"],
  ["examples/docs-snippets/guides/runtime/providers/layer-first.ts", "requires OPENAI_API_KEY"],
  ["examples/docs-snippets/guides/runtime/providers/openrouter.ts", "requires OPENROUTER_API_KEY"],
  ["examples/docs-snippets/guides/tools/mcp/connect-server.ts", "requires OPENROUTER_API_KEY and an MCP server"],
  ["examples/docs-snippets/research-agent/approve.ts", "requires a running research server and RUN_ID"],
])

const credentialNames = [
  "ANTHROPIC_API_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "EXA_API_KEY",
  "GOOGLE_AI_STUDIO_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "SUPERMEMORY_API_KEY",
] as const

const failure = (message: string): ScriptedSurfaceFailed => ScriptedSurfaceFailed.make({ message })

const sorted = (values: Iterable<string>): Array<string> => {
  const result = Array.from(values)
  result.sort((a, b) => a.localeCompare(b))
  return result
}

const exampleTargets = Effect.fn("VerifyScriptedSurfaces.exampleTargets")(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const names = sorted(yield* fileSystem.readDirectory("examples"))
  const targets: Array<Target> = []
  for (const name of names) {
    const manifestPath = `examples/${name}/package.json`
    if (!(yield* fileSystem.exists(manifestPath))) continue
    const manifest = yield* Schema.decodeEffect(Schema.fromJsonString(PackageManifest))(
      yield* fileSystem.readFileString(manifestPath),
    )
    if (manifest.scripts?.start === undefined || skippedExamples.has(name)) continue
    const target: Target = {
      label: `example ${name}`,
      args: ["run", "start"],
      cwd: `examples/${name}`,
      server: name === "deep-research-agent" || name === "mcp-toolkit-server" ? name : undefined,
    }
    targets.push(target)
  }
  return targets
})

const snippetTargets = Effect.fn("VerifyScriptedSurfaces.snippetTargets")(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const paths = yield* spawner.lines(ChildProcess.make("rg", ["-l", "^await ", "examples/docs-snippets", "-g", "*.ts"]))
  return sorted(paths.filter((path) => !skippedSnippets.has(path))).map(
    (path): Target => ({
      label: `snippet ${path}`,
      args: [path],
      cwd: ".",
    }),
  )
})

const environment = (target: Target, index: number, storage: LocalS3, targetId: string, port?: number) => [
  `GENERALIST_ENVIRONMENT=scripted-surfaces-${storage.runId}`,
  "GENERALIST_TENANT=scripted-surfaces",
  `GENERALIST_PARTITION=target-${index}-${targetId}`,
  `GENERALIST_BUCKET=${storage.bucket}`,
  "AWS_REGION=us-east-1",
  `AWS_ACCESS_KEY_ID=${credentials.accessKeyId}`,
  `AWS_SECRET_ACCESS_KEY=${credentials.secretAccessKey}`,
  `GENERALIST_S3_ENDPOINT=${storage.endpoint}`,
  "GENERALIST_S3_CAPABILITIES_CONFIRMED=true",
  `GENERALIST_SERVER_TOKEN=${targetId}`,
  ...(port === undefined ? [] : [`PORT=${port}`]),
]

const reservePort = Effect.gen(function* () {
  const server = yield* makeNodeSocketServer({ host: "127.0.0.1", port: 0 })
  if (server.address._tag !== "TcpAddress") return yield* failure("Expected a local TCP listener")
  return server.address.port
})

const serverReadiness = (server: NonNullable<Target["server"]>, port: number, serverToken: string) => {
  const endpoint = `http://127.0.0.1:${port}`
  const request =
    server === "deep-research-agent"
      ? HttpClientRequest.post(`${endpoint}/auth/session`).pipe(
          HttpClientRequest.setHeader("authorization", `Bearer ${serverToken}`),
          HttpClientRequest.setHeader("origin", endpoint),
        )
      : HttpClientRequest.post(`${endpoint}/mcp`).pipe(
          HttpClientRequest.setHeader("accept", "application/json, text/event-stream"),
          HttpClientRequest.setHeader("mcp-protocol-version", "2025-06-18"),
          HttpClientRequest.bodyJsonUnsafe({
            jsonrpc: "2.0",
            id: "scripted-surfaces-readiness",
            method: "initialize",
            params: {
              protocolVersion: "2025-06-18",
              capabilities: {},
              clientInfo: { name: "verify-scripted-surfaces", version: "1" },
            },
          }),
        )
  return HttpClient.execute(request).pipe(
    Effect.flatMap((response) => {
      if (response.status !== (server === "deep-research-agent" ? 204 : 200)) {
        return failure(`${server} returned ${response.status} during readiness`)
      }
      if (server === "mcp-toolkit-server" && response.headers["mcp-session-id"] === undefined) {
        return failure("mcp-toolkit-server did not establish an MCP session during readiness")
      }
      return Effect.void
    }),
    Effect.retry({ times: 20, schedule: Schedule.spaced("100 millis") }),
  )
}

const expectedServerOutput = (server: NonNullable<Target["server"]>, port: number) =>
  server === "deep-research-agent"
    ? new RegExp(`deep-research-agent demo server listening on http://localhost:${port}`)
    : new RegExp(`legacy MCP 2025-06-18 server listening on port ${port}`)

export const waitForOutput = Effect.fn("VerifyScriptedSurfaces.waitForOutput")(function* (
  output: Ref.Ref<string>,
  expected: RegExp,
) {
  return yield* Ref.get(output).pipe(
    Effect.flatMap((text) => (expected.test(text) ? Effect.void : failure(`server did not emit ${String(expected)}`))),
    Effect.retry({ times: 20, schedule: Schedule.spaced("100 millis") }),
  )
})

export const observeServer = Effect.fn("VerifyScriptedSurfaces.observeServer")(function* <A, E, R>(
  readiness: Effect.Effect<A, E, R>,
  exitCode: Effect.Effect<number>,
) {
  return yield* Effect.all(
    [readiness.pipe(Effect.timeout("3 seconds")), exitCode.pipe(Effect.timeoutOption("3 seconds"))],
    { concurrency: "unbounded" },
  ).pipe(Effect.map(([, exit]) => exit))
})

export const runTarget = Effect.fn("VerifyScriptedSurfaces.runTarget")(
  function* (target: Target, index: number, storage: LocalS3) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const crypto = yield* Crypto.Crypto
    const output = yield* Ref.make("")
    const targetId = yield* crypto.randomUUIDv4
    const port = target.server === undefined ? undefined : yield* Effect.scoped(reservePort)
    const command = ChildProcess.make(
      "env",
      [
        ...credentialNames.flatMap((name) => ["-u", name]),
        ...environment(target, index, storage, targetId, port),
        "bun",
        ...target.args,
      ],
      { cwd: target.cwd },
    )
    const result = yield* Effect.scoped(
      Effect.gen(function* () {
        const handle = yield* spawner.spawn(command)
        const collector = yield* handle.all.pipe(
          Stream.decodeText(),
          Stream.runForEach((text) => Ref.update(output, (current) => current + text)),
          Effect.forkScoped,
        )
        const exitCode =
          target.server === undefined
            ? yield* handle.exitCode.pipe(Effect.timeoutOption("20 seconds"))
            : yield* observeServer(
                Effect.all([
                  serverReadiness(target.server, port!, targetId),
                  waitForOutput(output, expectedServerOutput(target.server, port!)),
                ]),
                handle.exitCode,
              )
        if (Option.isSome(exitCode) && target.server === undefined) yield* Fiber.join(collector)
        else yield* Effect.sleep("10 millis")
        return { exitCode, output: yield* Ref.get(output) }
      }),
    )
    if (/ModelStreamTruncated|has no tool authorization policy/i.test(result.output)) {
      return yield* failure(`${target.label} emitted a forbidden framework error\n${result.output}`)
    }
    if (Option.isNone(result.exitCode)) {
      if (target.server !== undefined) return target
      return yield* failure(`${target.label} timed out\n${result.output}`)
    }
    if (target.server !== undefined) {
      return yield* failure(
        `${target.label} exited before its server timeout with code ${result.exitCode.value}\n${result.output}`,
      )
    }
    if (result.exitCode.value !== 0) {
      return yield* failure(`${target.label} exited with code ${result.exitCode.value}\n${result.output}`)
    }
    return target
  },
  Effect.mapError((error) => (Schema.is(ScriptedSurfaceFailed)(error) ? error : failure(String(error)))),
)

export const program = Effect.fn("VerifyScriptedSurfaces.program")(function* (storage: LocalS3) {
  const examples = yield* exampleTargets()
  const snippets = yield* snippetTargets()
  for (const [name, reason] of skippedExamples) yield* Console.log(`SKIP example ${name}: ${reason}`)
  for (const [path, reason] of skippedSnippets) yield* Console.log(`SKIP snippet ${path}: ${reason}`)
  const results = yield* Effect.forEach(
    [...examples, ...snippets],
    (target, index) => Effect.result(runTarget(target, index, storage)),
    { concurrency: 4 },
  )
  const failures: Array<string> = []
  for (const result of results) {
    if (Result.isFailure(result)) failures.push(result.failure.message)
    else yield* Console.log(`PASS ${result.success.label}`)
  }
  const skipped = skippedExamples.size + skippedSnippets.size
  const passed = results.length - failures.length
  yield* Console.log(
    `Scripted surfaces: ${passed} passed, ${skipped} skipped, ${failures.length} failed (${examples.length + skippedExamples.size} example starts, ${snippets.length + skippedSnippets.size} snippets)`,
  )
  if (failures.length > 0) return yield* failure(failures.join("\n\n"))
})

if (import.meta.main) {
  await Effect.runPromise(
    withMinio((storage) => program(storage).pipe(Effect.provide(Layer.merge(layer, FetchHttpClient.layer)))).pipe(
      Effect.provide(BunCrypto.layer),
    ),
  )
}
