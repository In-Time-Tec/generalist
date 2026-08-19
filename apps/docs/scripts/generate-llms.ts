import { runMain } from "@effect/platform-bun/BunRuntime"
import { layer } from "@effect/platform-bun/BunServices"
import { Effect, FileSystem, Layer, Path, Schema } from "effect"
import { createServer } from "vite"

class LlmsGenerationError extends Schema.TaggedError<LlmsGenerationError>()("LlmsGenerationError", {
  message: Schema.String,
}) {}

const program = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const server = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () => createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" }),
      catch: (error) => LlmsGenerationError.make({ message: String(error) }),
    }),
    (acquiredServer) => Effect.tryPromise(() => acquiredServer.close()).pipe(Effect.ignore),
  )
  const registry = yield* Effect.tryPromise({
    try: () => server.ssrLoadModule("/src/content/registry.ts"),
    catch: (error) => LlmsGenerationError.make({ message: String(error) }),
  })
  if (typeof registry.llmsIndex !== "function" || typeof registry.llmsFull !== "function") {
    return yield* LlmsGenerationError.make({ message: "docs registry does not export llmsIndex and llmsFull" })
  }
  const [index, full] = yield* Effect.all([
    Effect.try({
      try: () => String(registry.llmsIndex()),
      catch: (error) => LlmsGenerationError.make({ message: String(error) }),
    }),
    Effect.try({
      try: () => String(registry.llmsFull()),
      catch: (error) => LlmsGenerationError.make({ message: String(error) }),
    }),
  ])
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
