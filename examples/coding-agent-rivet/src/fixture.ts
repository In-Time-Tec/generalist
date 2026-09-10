import { Context, Effect, Layer, Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"

export const fixturePath = "src/average.ts" as const
export const buggySource =
  "export const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length\n"
export const fixedSource =
  "export const average = (values: number[]) => values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length\n"

const FixturePath = Schema.Literal(fixturePath)
const PatchSnapshot = Schema.Struct({ path: FixturePath, source: Schema.String })
const TestCase = Schema.Struct({ input: Schema.Array(Schema.Finite), expected: Schema.String, actual: Schema.String })
const TestReport = Schema.Struct({ passed: Schema.Int, failed: Schema.Int, cases: Schema.Array(TestCase) })

export class FixtureFailure extends Schema.TaggedError<FixtureFailure>()("CodingAgentFixtureFailure", {
  message: Schema.String,
}) {}

interface WorkspaceService {
  readonly read: (path: typeof fixturePath) => Effect.Effect<string, FixtureFailure>
  readonly applyPatch: (input: {
    readonly path: typeof fixturePath
    readonly before: string
    readonly after: string
  }) => Effect.Effect<typeof PatchSnapshot.Type, FixtureFailure>
  readonly runTests: (input: {
    readonly path: typeof fixturePath
    readonly source: string
  }) => Effect.Effect<typeof TestReport.Type, FixtureFailure>
  readonly close: Effect.Effect<void>
}

export class FixtureWorkspace extends Context.Service<FixtureWorkspace, WorkspaceService>()(
  "generalist-example-coding-agent-rivet/fixture/FixtureWorkspace",
) {}

const makeWorkspace = (): WorkspaceService => {
  let open = true
  const ensureOpen = (): Effect.Effect<void, FixtureFailure> =>
    open ? Effect.void : FixtureFailure.make({ message: "The fixture workspace scope is closed" })
  const implementation = (source: string) => {
    if (source === buggySource) {
      return (values: ReadonlyArray<number>): number => values.reduce((sum, value) => sum + value, 0) / values.length
    }
    if (source === fixedSource) {
      return (values: ReadonlyArray<number>): number =>
        values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
    }
    return undefined
  }
  return FixtureWorkspace.of({
    read: () => ensureOpen().pipe(Effect.as(buggySource)),
    applyPatch: ({ path, before, after }) =>
      Effect.gen(function* () {
        yield* ensureOpen()
        if (before !== buggySource || after !== fixedSource) {
          return yield* FixtureFailure.make({
            message: "The patch must transform the one allowlisted fixture revision",
          })
        }
        return { path, source: after }
      }),
    runTests: ({ source }) =>
      Effect.gen(function* () {
        yield* ensureOpen()
        const average = implementation(source)
        if (average === undefined) {
          return yield* FixtureFailure.make({ message: "Tests only run against an allowlisted fixture revision" })
        }
        const cases = [
          { input: [], expected: 0 },
          { input: [2, 4], expected: 3 },
          { input: [-2, 2], expected: 0 },
        ].map(({ input, expected }) => {
          const actual = average(input)
          return { input, expected: String(expected), actual: String(actual), passed: Object.is(actual, expected) }
        })
        return {
          passed: cases.filter((test) => test.passed).length,
          failed: cases.filter((test) => !test.passed).length,
          cases: cases.map(({ passed: _passed, ...test }) => test),
        }
      }),
    close: Effect.sync(() => {
      open = false
    }),
  })
}

export const fixtureWorkspaceLayer = Layer.effect(
  FixtureWorkspace,
  Effect.acquireRelease(Effect.sync(makeWorkspace), (workspace) => workspace.close),
)

export const readFile = Tool.make("read_file", {
  description: "Read the allowlisted src/average.ts fixture.",
  parameters: Schema.Struct({ path: FixturePath }),
  success: Schema.String,
  failure: FixtureFailure,
  failureMode: "return",
  dependencies: [FixtureWorkspace],
})

export const applyPatch = Tool.make("apply_patch", {
  description: "Transform the allowlisted src/average.ts fixture into a candidate snapshot.",
  parameters: Schema.Struct({ path: FixturePath, before: Schema.String, after: Schema.String }),
  success: PatchSnapshot,
  failure: FixtureFailure,
  failureMode: "return",
  dependencies: [FixtureWorkspace],
})

export const runTests = Tool.make("run_tests", {
  description: "Run fixed test cases against one allowlisted src/average.ts snapshot without evaluating source text.",
  parameters: Schema.Struct({ path: FixturePath, source: Schema.String }),
  success: TestReport,
  failure: FixtureFailure,
  failureMode: "return",
  dependencies: [FixtureWorkspace],
})

export const fixtureToolkit = Toolkit.make(readFile, applyPatch, runTests)

export const fixtureToolLayer = fixtureToolkit.toLayer({
  read_file: ({ path }) => Effect.flatMap(FixtureWorkspace, (workspace) => workspace.read(path)),
  apply_patch: (input) => Effect.flatMap(FixtureWorkspace, (workspace) => workspace.applyPatch(input)),
  run_tests: (input) => Effect.flatMap(FixtureWorkspace, (workspace) => workspace.runTests(input)),
})
