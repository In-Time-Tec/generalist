import { Effect, FileSystem, Path, PlatformError } from "effect"
import { Instructions } from "tenetkit"
import { InstructionFiles } from "tenetkit/skills"

export const repoProviders: Effect.Effect<
  ReadonlyArray<Instructions.Provider>,
  PlatformError.PlatformError,
  FileSystem.FileSystem | Path.Path
> = InstructionFiles.load({ cwd: "." }).pipe(
  Effect.map((files) => files.map((file) => Instructions.fromText(file.path, file.content))),
)
