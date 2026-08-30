import { Effect, FileSystem, Path, PlatformError } from "effect"

/** @experimental Loaded instruction-file content. */
export interface File {
  readonly path: string
  readonly content: string
}

/** @experimental Instruction-file discovery options. */
export interface Options {
  readonly filenames?: ReadonlyArray<string>
  readonly cwd?: string
  readonly globalFiles?: ReadonlyArray<string>
}

const DEFAULT_FILENAMES = ["AGENTS.md", "CLAUDE.md"] as const

const readIfExists = (
  fs: FileSystem.FileSystem,
  file: string,
): Effect.Effect<File | undefined, PlatformError.PlatformError> =>
  Effect.gen(function* () {
    if (!(yield* fs.exists(file))) return undefined
    const content = yield* fs.readFileString(file)
    return { path: file, content }
  })

const ancestors = (path: Path.Path, cwd: string): ReadonlyArray<string> => {
  const directories: Array<string> = []
  let cursor = path.resolve(cwd)
  while (true) {
    directories.push(cursor)
    const parent = path.dirname(cursor)
    if (parent === cursor) break
    cursor = parent
  }
  return directories.toReversed()
}

/** @experimental Load AGENTS.md / CLAUDE.md instruction files. */
export const load = (
  options: Options = {},
): Effect.Effect<ReadonlyArray<File>, PlatformError.PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const filenames = options.filenames ?? DEFAULT_FILENAMES
    const files: Array<File> = []
    for (const globalFile of options.globalFiles ?? []) {
      const loaded = yield* readIfExists(fs, globalFile)
      if (loaded !== undefined) files.push(loaded)
    }
    for (const directory of ancestors(path, options.cwd ?? ".")) {
      for (const filename of filenames) {
        const loaded = yield* readIfExists(fs, path.join(directory, filename))
        if (loaded !== undefined) {
          files.push(loaded)
          break
        }
      }
    }
    return files
  })
