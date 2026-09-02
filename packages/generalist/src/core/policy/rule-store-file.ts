import { Effect, FileSystem, Layer, Path, PlatformError, Random, Ref, Schema, Semaphore, Stream } from "effect"
import { Yaml } from "effect/unstable/encoding"
import { InvalidRuleFile, PermissionError, RuleFile, RuleStore, type Rule } from "./rule-store.js"

const directoryMode = 0o700
const fileMode = 0o600

/** One JSON or YAML permission-rule file. */
export interface RuleStoreFileOptions {
  readonly path: string
}

type FileState =
  | { readonly _tag: "Ready"; readonly rules: ReadonlyArray<Rule> }
  | { readonly _tag: "Failed"; readonly error: InvalidRuleFile | PermissionError }

const isNotFound = (error: PlatformError.PlatformError): boolean => error.reason._tag === "NotFound"

const permissionError = (message: string): PermissionError => PermissionError.make({ message })

const invalidRuleFile = (path: string, issues: string): InvalidRuleFile => InvalidRuleFile.make({ path, issues })

const decodeDocument = (path: string, text: string): Effect.Effect<ReadonlyArray<Rule>, InvalidRuleFile> =>
  (path.endsWith(".yaml") || path.endsWith(".yml")
    ? Effect.try({ try: () => Yaml.parse(text), catch: (error) => String(error) }).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(RuleFile)),
      )
    : Schema.decodeEffect(Schema.fromJsonString(RuleFile))(text)
  ).pipe(Effect.mapError((error) => invalidRuleFile(path, String(error))))

const readRules = (
  fileSystem: FileSystem.FileSystem,
  file: string,
): Effect.Effect<ReadonlyArray<Rule>, InvalidRuleFile | PermissionError> =>
  fileSystem.readFileString(file).pipe(
    Effect.matchEffect({
      onFailure: (error) =>
        isNotFound(error)
          ? Effect.succeed([])
          : Effect.fail(permissionError(`permission rule file is unreadable at ${file}`)),
      onSuccess: (text) => decodeDocument(file, text),
    }),
  )

const writeRules = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  file: string,
  rules: ReadonlyArray<Rule>,
): Effect.Effect<void, PermissionError> =>
  Effect.gen(function* () {
    const text = yield* Schema.encodeEffect(Schema.fromJsonString(RuleFile))(rules).pipe(
      Effect.mapError(() => permissionError(`permission rules cannot be encoded for ${file}`)),
    )
    const directory = path.dirname(file)
    const stamp = yield* Random.nextIntBetween(0, 0xffffffff)
    const temporary = path.join(directory, `.${path.basename(file)}.${stamp.toString(16)}.tmp`)
    yield* fileSystem
      .makeDirectory(directory, { recursive: true, mode: directoryMode })
      .pipe(Effect.mapError(() => permissionError(`permission rule directory is unwritable at ${directory}`)))
    yield* fileSystem.writeFileString(temporary, text, { mode: fileMode }).pipe(
      Effect.mapError(() => permissionError(`permission rule file is unwritable at ${file}`)),
      Effect.onExit((exit) =>
        exit._tag === "Success" ? Effect.void : fileSystem.remove(temporary, { force: true }).pipe(Effect.ignore),
      ),
    )
    yield* fileSystem.rename(temporary, file).pipe(
      Effect.mapError(() => permissionError(`permission rule file cannot be replaced at ${file}`)),
      Effect.onExit((exit) =>
        exit._tag === "Success" ? Effect.void : fileSystem.remove(temporary, { force: true }).pipe(Effect.ignore),
      ),
    )
  })

const make = (options: RuleStoreFileOptions) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const initial = yield* readRules(fileSystem, options.path)
    const state = yield* Ref.make<FileState>({ _tag: "Ready", rules: initial })
    const writes = yield* Semaphore.make(1)
    const directory = path.dirname(options.path)
    yield* fileSystem
      .makeDirectory(directory, { recursive: true, mode: directoryMode })
      .pipe(Effect.mapError(() => permissionError(`permission rule directory is unwritable at ${directory}`)))
    const refresh = readRules(fileSystem, options.path).pipe(
      Effect.match({
        onFailure: (error): FileState => ({ _tag: "Failed", error }),
        onSuccess: (rules): FileState => ({ _tag: "Ready", rules }),
      }),
      Effect.flatMap((current) => Ref.set(state, current)),
    )
    yield* fileSystem.watch(directory).pipe(
      Stream.runForEach(() => refresh),
      Effect.ignore,
      Effect.forkScoped,
    )
    return RuleStore.of({
      remember: (rule) =>
        writes.withPermit(
          Effect.gen(function* () {
            const current = yield* readRules(fileSystem, options.path)
            const rules = [...current.filter((existing) => existing.pattern !== rule.pattern), rule]
            yield* writeRules(fileSystem, path, options.path, rules)
            yield* Ref.set(state, { _tag: "Ready", rules })
          }),
        ),
      rules: Ref.get(state).pipe(
        Effect.flatMap((current) =>
          current._tag === "Ready" ? Effect.succeed(current.rules) : Effect.fail(current.error),
        ),
      ),
    })
  })

/** A watched, atomically written JSON or YAML RuleStore. */
export const layerRuleStoreFile = (
  options: RuleStoreFileOptions,
): Layer.Layer<RuleStore, InvalidRuleFile | PermissionError, FileSystem.FileSystem | Path.Path> =>
  Layer.effect(RuleStore, make(options))
