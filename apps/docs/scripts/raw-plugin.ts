import { runMain } from "@effect/platform-bun/BunRuntime"
import { layer } from "@effect/platform-bun/BunServices"
import { plugin } from "bun"
import { Effect, FileSystem, Layer, Path, Schema } from "effect"

const program = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const context = yield* Effect.context<FileSystem.FileSystem | Path.Path>()
  yield* Effect.sync(() =>
    plugin({
      name: "raw-imports",
      setup(build) {
        build.onResolve({ filter: /\?raw$/ }, (args) => ({
          path: `${path.resolve(path.dirname(args.importer), args.path.slice(0, -"?raw".length))}?raw-text`,
        }))
        build.onLoad({ filter: /\?raw-text$/ }, (args) =>
          Effect.runPromiseWith(context)(
            fileSystem.readFileString(args.path.slice(0, -"?raw-text".length)).pipe(
              Effect.map((contents) => ({
                contents: `export default ${Schema.encodeSync(Schema.UnknownFromJsonString)(contents)}`,
                loader: "js" as const,
              })),
            ),
          ),
        )
      },
    }),
  )
})

runMain(
  Effect.gen(function* () {
    const context = yield* Layer.build(layer)
    yield* program.pipe(Effect.provide(context))
  }).pipe(Effect.scoped),
)
