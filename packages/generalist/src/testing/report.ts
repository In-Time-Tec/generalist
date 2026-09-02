import { Effect, FileSystem, Path, PlatformError, Schema } from "effect"

/** One conformance suite observed in the current test process. */
export const Suite = Schema.Struct({
  name: Schema.String,
  capabilities: Schema.Array(Schema.String),
})

/** Machine-readable conformance certification report. */
export const Certification = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  suites: Schema.Array(Suite),
})
export type Suite = typeof Suite.Type
export type Certification = typeof Certification.Type

const suites = new Map<string, Suite>()

/** @internal */
export const record = (suite: Suite): Effect.Effect<void> =>
  Effect.sync(() => {
    suites.set(suite.name, Suite.make({ name: suite.name, capabilities: [...suite.capabilities].toSorted() }))
  })

/** @internal */
export const writeCertification = (options: {
  readonly path: string
  readonly certification: Certification
}): Effect.Effect<void, PlatformError.PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const certification = Certification.make({
      schemaVersion: 1,
      suites: options.certification.suites
        .map((suite) => Suite.make({ name: suite.name, capabilities: [...suite.capabilities].toSorted() }))
        .toSorted((left, right) => left.name.localeCompare(right.name)),
    })
    const text = yield* Schema.encodeEffect(Schema.fromJsonString(Certification))(certification).pipe(Effect.orDie)
    yield* fileSystem.makeDirectory(path.dirname(options.path), { recursive: true })
    yield* fileSystem.writeFileString(options.path, `${text}\n`)
  })

/** Writes the suites observed in this process as deterministic JSON. */
export const write = (options: {
  readonly path: string
}): Effect.Effect<void, PlatformError.PlatformError, FileSystem.FileSystem | Path.Path> =>
  writeCertification({
    path: options.path,
    certification: Certification.make({ schemaVersion: 1, suites: [...suites.values()] }),
  })

/** @internal */
export const reset = Effect.sync(() => suites.clear())
