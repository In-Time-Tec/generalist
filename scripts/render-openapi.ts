/* oxlint-disable effecttsgo/strict-effect-provide -- this script is an application entry point. */
import { layer } from "@effect/platform-bun/BunServices"
import { Console, Effect, FileSystem, Schema } from "effect"
import { Command, Flag } from "effect/unstable/cli"
import { OpenApi } from "effect/unstable/httpapi"
import { format, resolveConfig } from "prettier"
import { api } from "../packages/generalist/src/server/api.js"

class OpenApiDocumentationFailed extends Schema.TaggedError<OpenApiDocumentationFailed>()(
  "generalist/scripts/OpenApiDocumentationFailed",
  { message: Schema.String },
) {}

const documentationPath = "docs/openapi.json"
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Json))

export const renderOpenApi = Effect.fn("RenderOpenApi.render")(function* () {
  return yield* Effect.tryPromise({
    try: () =>
      resolveConfig(documentationPath).then((options) =>
        format(encodeJson(OpenApi.fromApi(api)), { ...options, filepath: documentationPath }),
      ),
    catch: (error) => OpenApiDocumentationFailed.make({ message: `could not format OpenAPI: ${String(error)}` }),
  })
})

const program = Effect.fn("RenderOpenApi.program")(function* (check: boolean) {
  const fileSystem = yield* FileSystem.FileSystem
  const rendered = yield* renderOpenApi()
  if (!check) {
    yield* fileSystem.writeFileString(documentationPath, rendered)
    return
  }
  const current = yield* fileSystem.readFileString(documentationPath)
  if (current !== rendered) {
    return yield* OpenApiDocumentationFailed.make({
      message: `${documentationPath} has drifted; run bun scripts/render-openapi.ts`,
    })
  }
  yield* Console.log(`${documentationPath} matches Server.api`)
})

const command = Command.make(
  "render-openapi",
  { check: Flag.boolean("check").pipe(Flag.withDefault(false)) },
  ({ check }) => program(check),
)

if (import.meta.main) {
  await Effect.runPromise(Command.run(command, { version: "1" }).pipe(Effect.provide(layer)))
}
