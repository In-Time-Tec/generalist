import { Effect, FileSystem, Path, PlatformError } from "effect"
import { Instructions } from "tenetkit"
import { load } from "tenetkit/instructions"

export const repoProviders: Effect.Effect<
  ReadonlyArray<Instructions.Provider>,
  PlatformError.PlatformError,
  FileSystem.FileSystem | Path.Path
> = load({ cwd: "." }).pipe(Effect.map((files) => files.map((file) => Instructions.fromText(file.path, file.content))))
