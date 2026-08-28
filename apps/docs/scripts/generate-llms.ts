import { runMain } from "@effect/platform-bun/BunRuntime"
import { layer } from "@effect/platform-bun/BunServices"
import { Effect, FileSystem, Layer, Path, Schema } from "effect"
import { createServer } from "vite"

class LlmsGenerationError extends Schema.TaggedError<LlmsGenerationError>()("LlmsGenerationError", {
  message: Schema.String,
}) {}

const LlmsRegistry = Schema.Struct({
  llmsIndex: Schema.declare(
    (input): input is () => string => Object.prototype.toString.call(input) === "[object Function]",
  ),
  llmsFull: Schema.declare(
    (input): input is () => string => Object.prototype.toString.call(input) === "[object Function]",
  ),
})

const program = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const server = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () =>
        createServer({
          configFile: false,
          server: { middlewareMode: true },
          appType: "custom",
          plugins: [
            {
              name: "source-text",
              enforce: "pre",
              resolveId(id) {
                return id.startsWith("virtual:source/")
                  ? `${new URL(`../${id.slice("virtual:source/".length)}`, import.meta.url).pathname}?raw`
                  : null
              },
            },
          ],
        }),
      catch: (error) => LlmsGenerationError.make({ message: String(error) }),
    }),
    (acquiredServer) => Effect.tryPromise(() => acquiredServer.close()).pipe(Effect.ignore),
  )
  const loaded = yield* Effect.tryPromise({
    try: () => server.ssrLoadModule("/src/content/registry.ts"),
    catch: (error) => LlmsGenerationError.make({ message: String(error) }),
  })
  const registry = yield* Schema.decodeEffect(LlmsRegistry)(loaded)
  const index = registry.llmsIndex()
  const full = registry.llmsFull()
  const scriptPath = yield* path.fromFileUrl(new URL(import.meta.url))
  const publicDirectory = path.join(path.dirname(scriptPath), "..", "public")
  yield* Effect.all([
    fileSystem.writeFileString(path.join(publicDirectory, "llms.txt"), `${index}\n`),
    fileSystem.writeFileString(path.join(publicDirectory, "llms-full.txt"), `${full}\n`),
  ])
})

runMain(
  Effect.gen(function* () {
    const context = yield* Layer.build(layer)
    yield* program.pipe(Effect.provide(context))
  }).pipe(Effect.scoped),
)
