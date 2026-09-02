import { Effect, FileSystem, Layer, Path, PlatformError, Random, Schema } from "effect"
import type { SessionId } from "../cell.js"
import {
  KernelSnapshotStore,
  KernelStateUnavailable,
  Manifest,
  snapshotId,
  type Service,
  type Snapshot,
} from "../kernel-snapshot-store.js"

const DIRECTORY_MODE = 0o700
const FILE_MODE = 0o600

/** Where one Session's best-effort namespace snapshot is written. */
export interface Options {
  readonly dataRoot: string
}

const snapshotError = (
  sessionId: string,
  reason: KernelStateUnavailable["reason"],
  message: string,
): KernelStateUnavailable => KernelStateUnavailable.make({ sessionId, reason, message })

const isNotFound = (error: PlatformError.PlatformError): boolean => error.reason._tag === "NotFound"

const decodeManifest = Schema.decodeUnknownEffect(Schema.fromJsonString(Manifest))
const encodeManifest = Schema.encodeEffect(Schema.fromJsonString(Manifest))

const safeName = (sessionId: string): string => sessionId.replace(/[^A-Za-z0-9_-]/g, "_")

/**
 * Best-effort namespace persistence on the Effect filesystem. Snapshots are
 * owner-only, written through a same-directory temporary file plus rename so a reader never
 * observes a partial capture, and a corrupt manifest fails typed instead of being restored.
 */
export const make = (options: Options): Effect.Effect<Service, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const directoryOf = (sessionId: string): string => path.join(options.dataRoot, "kernel-state", safeName(sessionId))
    const manifestFile = (sessionId: string): string => path.join(directoryOf(sessionId), "manifest.json")
    const payloadFile = (sessionId: string): string => path.join(directoryOf(sessionId), "payload.bin")
    const immutableDirectory = (id: string): string => path.join(options.dataRoot, "kernel-snapshots", safeName(id))
    const immutableManifestFile = (id: string): string => path.join(immutableDirectory(id), "manifest.json")
    const immutablePayloadFile = (id: string): string => path.join(immutableDirectory(id), "payload.bin")
    const writeAtomic = (
      sessionId: string,
      file: string,
      write: (temporary: string) => Effect.Effect<void, PlatformError.PlatformError>,
    ): Effect.Effect<void, KernelStateUnavailable> =>
      Effect.gen(function* () {
        const directory = path.dirname(file)
        const stamp = yield* Random.nextIntBetween(0, 0xffffffff)
        const temporary = path.join(directory, `.${path.basename(file)}.${stamp.toString(16)}.tmp`)
        yield* fileSystem
          .makeDirectory(directory, { recursive: true, mode: DIRECTORY_MODE })
          .pipe(
            Effect.mapError(() =>
              snapshotError(sessionId, "io", `kernel state directory is unwritable at ${directory}`),
            ),
          )
        yield* write(temporary).pipe(
          Effect.mapError(() => snapshotError(sessionId, "io", `kernel state is unwritable at ${file}`)),
          Effect.onExit((exit) =>
            exit._tag === "Success" ? Effect.void : fileSystem.remove(temporary, { force: true }).pipe(Effect.ignore),
          ),
        )
        yield* fileSystem.rename(temporary, file).pipe(
          Effect.mapError(() => snapshotError(sessionId, "io", `kernel state cannot be replaced at ${file}`)),
          Effect.onExit((exit) =>
            exit._tag === "Success" ? Effect.void : fileSystem.remove(temporary, { force: true }).pipe(Effect.ignore),
          ),
        )
      })
    return {
      load: (sessionId: SessionId) =>
        fileSystem.readFileString(manifestFile(sessionId)).pipe(
          Effect.matchEffect({
            onFailure: (error) =>
              isNotFound(error)
                ? Effect.succeedNone
                : Effect.fail(snapshotError(sessionId, "io", `kernel state is unreadable for session ${sessionId}`)),
            onSuccess: (text) =>
              decodeManifest(text).pipe(
                Effect.mapError(() =>
                  snapshotError(sessionId, "corrupt", `kernel state manifest is corrupt for session ${sessionId}`),
                ),
                Effect.flatMap((manifest) =>
                  fileSystem.readFile(payloadFile(sessionId)).pipe(
                    Effect.mapError(() =>
                      snapshotError(sessionId, "corrupt", `kernel state payload is missing for session ${sessionId}`),
                    ),
                    Effect.map((payload): Snapshot => ({ manifest, payload })),
                  ),
                ),
                Effect.asSome,
              ),
          }),
          Effect.map((option) => (option._tag === "Some" ? option.value : undefined)),
        ),
      save: (snapshot: Snapshot) =>
        Effect.gen(function* () {
          const sessionId = snapshot.manifest.sessionId
          const text = yield* encodeManifest(snapshot.manifest).pipe(
            Effect.mapError(() => snapshotError(sessionId, "corrupt", "kernel state manifest cannot be encoded")),
          )
          yield* writeAtomic(sessionId, payloadFile(sessionId), (temporary) =>
            fileSystem.writeFile(temporary, snapshot.payload, { mode: FILE_MODE }),
          )
          yield* writeAtomic(sessionId, manifestFile(sessionId), (temporary) =>
            fileSystem.writeFileString(temporary, text, { mode: FILE_MODE }),
          )
        }),
      drop: (sessionId: SessionId) =>
        fileSystem
          .remove(directoryOf(sessionId), { recursive: true, force: true })
          .pipe(
            Effect.mapError(() =>
              snapshotError(sessionId, "io", `kernel state cannot be dropped for session ${sessionId}`),
            ),
          ),
      saveImmutable: (snapshot: Snapshot) =>
        Effect.gen(function* () {
          const id = snapshotId(snapshot)
          const text = yield* encodeManifest(snapshot.manifest).pipe(
            Effect.mapError(() => snapshotError(id, "corrupt", "kernel snapshot manifest cannot be encoded")),
          )
          yield* writeAtomic(id, immutablePayloadFile(id), (temporary) =>
            fileSystem.writeFile(temporary, snapshot.payload, { mode: FILE_MODE }),
          )
          yield* writeAtomic(id, immutableManifestFile(id), (temporary) =>
            fileSystem.writeFileString(temporary, text, { mode: FILE_MODE }),
          )
          return id
        }),
      loadImmutable: (id: string) =>
        fileSystem.readFileString(immutableManifestFile(id)).pipe(
          Effect.matchEffect({
            onFailure: (error) =>
              isNotFound(error)
                ? Effect.succeedNone
                : Effect.fail(snapshotError(id, "io", `kernel snapshot is unreadable for ${id}`)),
            onSuccess: (text) =>
              decodeManifest(text).pipe(
                Effect.mapError(() => snapshotError(id, "corrupt", `kernel snapshot manifest is corrupt for ${id}`)),
                Effect.flatMap((manifest) =>
                  fileSystem.readFile(immutablePayloadFile(id)).pipe(
                    Effect.mapError(() => snapshotError(id, "corrupt", `kernel snapshot payload is missing for ${id}`)),
                    Effect.map((payload): Snapshot => ({ manifest, payload })),
                  ),
                ),
                Effect.asSome,
              ),
          }),
          Effect.map((option) => (option._tag === "Some" ? option.value : undefined)),
        ),
    }
  })

/** One durable filesystem-backed kernel snapshot store. */
export const layer = (options: Options): Layer.Layer<KernelSnapshotStore, never, FileSystem.FileSystem | Path.Path> =>
  Layer.effect(KernelSnapshotStore, make(options).pipe(Effect.map(KernelSnapshotStore.of)))
