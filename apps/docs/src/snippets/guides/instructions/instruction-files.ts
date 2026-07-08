import { Effect, FileSystem, Path, PlatformError } from "effect"
import { Instructions } from "@batonfx/core"
import { InstructionFiles } from "@batonfx/skills"

export const repoSources: Effect.Effect<
  ReadonlyArray<Instructions.ContextSource>,
  PlatformError.PlatformError,
  FileSystem.FileSystem | Path.Path
> = InstructionFiles.loadInstructionFiles({ cwd: "." }).pipe(
  Effect.map((files) => files.map((file) => Instructions.staticSource(file.path, file.content))),
)
