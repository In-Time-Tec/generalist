import { expect, layer } from "@effect/vitest"
import { Effect, FileSystem, Path, PlatformError } from "effect"
import { layer as bunLayer } from "@effect/platform-bun/BunServices"

const ignored = /(?:^|\/)(?:repos|dist|coverage|node_modules|\.turbo|generated)(?:\/|$)/
const expectedRoots = ["packages", "apps", "examples", "test", "tooling"]

const filesUnder = (
  directory: string,
  root: string,
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<Array<string>, PlatformError.PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const exists = yield* fileSystem.exists(directory)
    if (!exists) return []
    const result: Array<string> = []
    const entries = yield* fileSystem.readDirectory(directory)
    for (const name of entries) {
      const file = path.join(directory, name)
      if (ignored.test(path.relative(root, file))) continue
      const info = yield* fileSystem.stat(file)
      if (info.type === "Directory") {
        result.push(...(yield* filesUnder(file, root, fileSystem, path)))
      } else if (info.type === "File" && name.endsWith(".test.ts")) {
        result.push(path.relative(root, file))
      }
    }
    return result
  })

layer(bunLayer)("workspace test discovery", (it) => {
  it.effect("keeps every behavioral test under the canonical Vitest roots", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const root = path.resolve(".")
      const discovered: Array<string> = (yield* Effect.forEach(expectedRoots, (directory) =>
        filesUnder(path.join(root, directory), root, fileSystem, path),
      )).flat()
      discovered.sort()
      expect(discovered.length).toBeGreaterThan(0)
      expect(discovered).not.toContain(expect.stringContaining("repos/effect"))
      for (const file of discovered) {
        const info = yield* fileSystem.stat(path.join(root, file))
        expect(info.type).toBe("File")
      }
    }),
  )
})
