/* oxlint-disable effecttsgo/strict-effect-provide -- this script is an application entry point. */
import { layer } from "@effect/platform-bun/BunServices"
import { Console, Effect, FileSystem, Path, Schema } from "effect"

class FeatureDocumentationFailed extends Schema.TaggedError<FeatureDocumentationFailed>()(
  "generalist/scripts/FeatureDocumentationFailed",
  { message: Schema.String },
) {}

const runnableFence = /^```(?:bash|js|jsx|sh|shell|ts|tsx)[ \t]*$/m
const testLink = /\]\((?:https:\/\/github\.com\/In-Time-Tec\/generalist\/blob\/main\/)?([^\s)]+\.test\.ts)(?:#[^)]+)?\)/

const localTestPath = (target: string): string => target.replace(/^\.\.\/\.\.\//, "")

const program = Effect.fn("DocsFeatures.program")(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const directory = path.resolve("docs/features")
  const files = (yield* fileSystem.readDirectory(directory)).filter((name) => name.endsWith(".md"))
  files.sort()
  const missingExamples: Array<string> = []
  const missingTests: Array<string> = []
  const brokenTests: Array<string> = []

  for (const name of files) {
    const source = yield* fileSystem.readFileString(path.join(directory, name))
    const match = testLink.exec(source)
    const exampleLine = source.slice(0, runnableFence.exec(source)?.index ?? source.length).split("\n").length
    if (!runnableFence.test(source) || exampleLine > 30) missingExamples.push(name)
    if (match === null) missingTests.push(name)
    else if (!(yield* fileSystem.exists(path.resolve(localTestPath(match[1])))))
      brokenTests.push(`${name}: ${match[1]}`)
  }

  yield* Console.log(
    `Feature docs: ${files.length} pages; ${files.length - missingExamples.length} leading runnable examples; ${files.length - missingTests.length} test links`,
  )
  if (missingExamples.length > 0) yield* Console.log(`Missing leading runnable examples: ${missingExamples.join(", ")}`)
  if (missingTests.length > 0) yield* Console.log(`Missing test links: ${missingTests.join(", ")}`)
  if (brokenTests.length > 0) {
    return yield* FeatureDocumentationFailed.make({ message: `Broken feature test links: ${brokenTests.join(", ")}` })
  }
})

await Effect.runPromise(program().pipe(Effect.provide(layer)))
