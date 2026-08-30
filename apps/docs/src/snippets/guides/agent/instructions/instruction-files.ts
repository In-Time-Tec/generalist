import { Effect, FileSystem, Path, PlatformError } from "effect"
import { Instructions } from "tenetkit"
import { InstructionFiles } from "tenetkit/skills"

export const repoSources: Effect.Effect<
  ReadonlyArray<Instructions.Source>,
  PlatformError.PlatformError,
  FileSystem.FileSystem | Path.Path
> = InstructionFiles.load({ cwd: "." }).pipe(
  Effect.map((files) => files.map((file) => Instructions.staticSource(file.path, file.content))),
)
