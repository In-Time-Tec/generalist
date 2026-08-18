import { Effect, FileSystem, Layer, Path, PlatformError, Random, Schema, Semaphore, SynchronizedRef } from "effect"
import { HarnessScope } from "./entry.js"
import { HarnessState, empty } from "./state.js"
import { HarnessStore, HarnessStoreError, type HarnessStoreRejection, type Interface } from "./store.js"

const DIRECTORY_MODE = 0o700
const FILE_MODE = 0o600

/** @experimental Where one scope's state is stored. The host owns every location decision. */
export interface Options {
  readonly path: (scope: HarnessScope) => string
}

const storeError = (
  reason: HarnessStoreRejection,
  scope: string,
  message: string,
  cause?: unknown,
): HarnessStoreError => HarnessStoreError.make({ reason, scope, message, ...(cause === undefined ? {} : { cause }) })

const isNotFound = (error: PlatformError.PlatformError): boolean => error.reason._tag === "NotFound"

const decodeState = Schema.decodeUnknownEffect(Schema.fromJsonString(HarnessState))
const encodeState = Schema.encodeEffect(Schema.fromJsonString(HarnessState))

const readState = (
  fileSystem: FileSystem.FileSystem,
  scope: HarnessScope,
  file: string,
): Effect.Effect<HarnessState, HarnessStoreError> =>
  fileSystem.readFileString(file).pipe(
    Effect.matchEffect({
      onFailure: (error) =>
        isNotFound(error)
          ? Effect.succeed(empty(scope))
          : Effect.fail(storeError("unreadable", scope, `harness state is unreadable at ${file}`, error)),
      onSuccess: (text) =>
        decodeState(text).pipe(
          Effect.mapError((error) => storeError("corrupt", scope, `harness state is corrupt at ${file}`, error)),
        ),
    }),
  )

const writeState = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  state: HarnessState,
  file: string,
): Effect.Effect<void, HarnessStoreError> =>
  Effect.gen(function* () {
    const text = yield* encodeState(state).pipe(
      Effect.mapError((error) => storeError("encode", state.scope, "harness state cannot be encoded", error)),
    )
    const directory = path.dirname(file)
    const stamp = yield* Random.nextIntBetween(0, 0xffffffff)
    const temporary = path.join(directory, `.${path.basename(file)}.${stamp.toString(16)}.tmp`)
    yield* fileSystem
      .makeDirectory(directory, { recursive: true, mode: DIRECTORY_MODE })
      .pipe(
        Effect.mapError((error) =>
          storeError("unwritable", state.scope, `harness directory is unwritable at ${directory}`, error),
        ),
      )
    yield* fileSystem.writeFileString(temporary, text, { mode: FILE_MODE }).pipe(
      Effect.mapError((error) =>
        storeError("unwritable", state.scope, `harness state is unwritable at ${file}`, error),
      ),
      Effect.onExit((exit) =>
        exit._tag === "Success" ? Effect.void : fileSystem.remove(temporary, { force: true }).pipe(Effect.ignore),
      ),
    )
    yield* fileSystem.rename(temporary, file).pipe(
      Effect.mapError((error) =>
        storeError("unwritable", state.scope, `harness state cannot be replaced at ${file}`, error),
      ),
      Effect.onExit((exit) =>
        exit._tag === "Success" ? Effect.void : fileSystem.remove(temporary, { force: true }).pipe(Effect.ignore),
      ),
    )
  })

/**
 * @experimental Build one durable store over the Effect filesystem. Writes are owner-only and land through a
 * same-directory temporary file plus rename, so a reader never observes a partial state. A corrupt file fails typed
 * instead of resetting the scope, and concurrent saves of one scope are serialized.
 */
export const make = (options: Options): Effect.Effect<Interface, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const locks = yield* SynchronizedRef.make(new Map<string, Semaphore.Semaphore>())
    const lockFor = (file: string): Effect.Effect<Semaphore.Semaphore> =>
      SynchronizedRef.modifyEffect(locks, (current) => {
        const existing = current.get(file)
        return existing === undefined
          ? Semaphore.make(1).pipe(Effect.map((lock) => [lock, new Map(current).set(file, lock)] as const))
          : Effect.succeed([existing, current] as const)
      })
    return {
      load: (scope) => readState(fileSystem, scope, options.path(scope)),
      save: (state) => {
        const file = options.path(state.scope)
        return lockFor(file).pipe(
          Effect.flatMap((lock) => lock.withPermits(1)(writeState(fileSystem, path, state, file))),
        )
      },
    }
  })

/** @experimental One durable filesystem-backed harness store. */
export const layer = (options: Options): Layer.Layer<HarnessStore, never, FileSystem.FileSystem | Path.Path> =>
  Layer.effect(HarnessStore, make(options).pipe(Effect.map(HarnessStore.of)))
