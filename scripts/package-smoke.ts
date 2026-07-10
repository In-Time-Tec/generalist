import { runMain } from "@effect/platform-bun/BunRuntime"
import { layer } from "@effect/platform-bun/BunServices"
import { Effect, FileSystem, Path, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

const packages = ["core", "test", "skills", "memory", "providers", "mcp", "transport", "foldkit"] as const

const exports = [
  "@batonfx/core",
  "@batonfx/test",
  "@batonfx/skills",
  "@batonfx/memory",
  "@batonfx/providers",
  "@batonfx/providers/catalog",
  "@batonfx/providers/openai",
  "@batonfx/providers/anthropic",
  "@batonfx/providers/openrouter",
  "@batonfx/providers/openai-compat",
  "@batonfx/providers/deterministic",
  "@batonfx/providers/presets",
  "@batonfx/providers/embedding",
  "@batonfx/mcp",
  "@batonfx/mcp/baton",
  "@batonfx/transport",
  "@batonfx/transport/client",
  "@batonfx/transport/errors",
  "@batonfx/transport/sse",
  "@batonfx/transport/ws",
  "@batonfx/transport/wire",
  "@batonfx/transport/session-registry",
  "@batonfx/foldkit",
] as const

const run = Effect.fn("PackageSmoke.run")(function* (command: string, args: ReadonlyArray<string>, cwd: string) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const handle = yield* spawner.spawn(ChildProcess.make(command, args, { cwd }))
  const [stdout, stderr, exitCode] = yield* Effect.all(
    [
      Stream.mkString(Stream.decodeText(handle.stdout)),
      Stream.mkString(Stream.decodeText(handle.stderr)),
      handle.exitCode,
    ],
    { concurrency: 3 },
  )
  if (exitCode !== 0) {
    return yield* Effect.fail(new Error(`${command} ${args.join(" ")} failed\n${stdout}\n${stderr}`))
  }
  return stdout
})

const program = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = path.resolve(".")
  const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "baton-package-smoke-" })
  const tarballDirectory = process.env.PACKAGE_ARTIFACT_DIR
    ? path.resolve(process.env.PACKAGE_ARTIFACT_DIR)
    : path.join(directory, "packages")
  const consumerDirectory = path.join(directory, "consumer")
  yield* fileSystem.makeDirectory(tarballDirectory, { recursive: true })
  yield* fileSystem.makeDirectory(consumerDirectory, { recursive: true })

  yield* run("bun", ["run", "build"], root)

  const tarballs: Record<string, string> = {}
  for (const packageName of packages) {
    const packageDirectory = path.join(root, "packages", packageName)
    const tarball = path.join(tarballDirectory, `${packageName}.tgz`)
    yield* run("bun", ["pm", "pack", "--filename", tarball, "--quiet"], packageDirectory)
    const archive = yield* fileSystem.readFile(tarball)
    if (archive.byteLength > 1_500_000) {
      return yield* Effect.fail(new Error(`@batonfx/${packageName} tarball exceeds 1.5 MB: ${archive.byteLength}`))
    }
    const listing = yield* run("tar", ["-tzf", tarball], root)
    const unexpected = listing
      .split("\n")
      .filter((entry) => entry.length > 0)
      .filter(
        (entry) =>
          entry !== "package/package.json" && entry !== "package/README.md" && !entry.startsWith("package/dist/"),
      )
    if (unexpected.length > 0) {
      return yield* Effect.fail(
        new Error(`@batonfx/${packageName} contains unexpected files: ${unexpected.join(", ")}`),
      )
    }
    tarballs[`@batonfx/${packageName}`] = `file:${tarball}`
  }

  yield* fileSystem.writeFileString(
    path.join(consumerDirectory, "package.json"),
    JSON.stringify({
      name: "baton-package-consumer",
      private: true,
      type: "module",
      dependencies: {
        ...tarballs,
        effect: "4.0.0-beta.93",
        foldkit: "0.122.0",
        typescript: "5.8.2",
      },
      overrides: tarballs,
    }),
  )
  yield* fileSystem.writeFileString(
    path.join(consumerDirectory, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        module: "NodeNext",
        moduleResolution: "NodeNext",
        target: "ES2024",
      },
      include: ["typecheck.ts"],
    }),
  )
  yield* fileSystem.writeFileString(
    path.join(consumerDirectory, "typecheck.ts"),
    `${exports.map((specifier) => `import ${JSON.stringify(specifier)}`).join("\n")}
import { OAuth, McpToolSource } from "@batonfx/mcp"
import { Effect, Layer, Option, Redacted } from "effect"
const tokenStore: OAuth.TokenStoreInterface = {
  load: () => Effect.succeed(Option.none()),
  save: (_server, tokens) => Effect.sync(() => void Redacted.value(tokens)),
  remove: () => Effect.void,
}
const storeLayer: Layer.Layer<OAuth.TokenStore> = OAuth.tokenStoreTestLayer(tokenStore)
const oauthLayer = OAuth.layer({
  serverUrl: "https://mcp.example/rpc",
  redirectUrl: "http://127.0.0.1/callback",
  clientMetadata: { redirect_uris: ["http://127.0.0.1/callback"] },
}).pipe(Layer.provide(storeLayer))
const proof = Effect.gen(function* () {
  const oauth = yield* OAuth.OAuth
  const transport: McpToolSource.McpTransport = { kind: "http", url: "https://mcp.example/rpc", oauth }
  return transport
}).pipe(Effect.provide(oauthLayer))
void proof
`,
  )
  yield* fileSystem.writeFileString(
    path.join(consumerDirectory, "runtime.mjs"),
    `const specifiers = ${JSON.stringify(exports)}\nfor (const specifier of specifiers) await import(specifier)\nconsole.log(\`imported \${specifiers.length} Baton exports\`)\n`,
  )

  yield* run("bun", ["install"], consumerDirectory)
  yield* run("bun", ["tsc", "--noEmit"], consumerDirectory)
  yield* run("node", ["runtime.mjs"], consumerDirectory)
  yield* run("bun", ["runtime.mjs"], consumerDirectory)
}).pipe(Effect.scoped, Effect.provide(layer))

runMain(program)
