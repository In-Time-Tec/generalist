import { describe, expect, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path, PlatformError } from "effect"
import { InstructionFiles } from "../src/index"

const notFound = (method: string, path: string) =>
  PlatformError.systemError({
    _tag: "NotFound",
    module: "InstructionFilesTest",
    method,
    description: "not found",
    pathOrDescriptor: path,
  })

const testFsLayer = (files: Readonly<Record<string, string>>) =>
  FileSystem.layerNoop({
    exists: (path) => Effect.succeed(path in files),
    readFileString: (path) => {
      const content = files[path]
      return content === undefined ? Effect.fail(notFound("readFileString", path)) : Effect.succeed(content)
    },
  })

describe("InstructionFiles", () => {
  it.effect("loads global files before root-to-cwd ancestors with AGENTS.md preferred", () => {
    const files = {
      "/global/AGENTS.md": "global",
      "/repo/AGENTS.md": "root agents",
      "/repo/a/CLAUDE.md": "a claude",
      "/repo/a/b/AGENTS.md": "b agents",
      "/repo/a/b/CLAUDE.md": "b claude ignored",
    }
    return Effect.gen(function* () {
      const loaded = yield* InstructionFiles.loadInstructionFiles({
        cwd: "/repo/a/b",
        globalFiles: ["/global/AGENTS.md"],
      })

      expect(loaded).toEqual([
        { path: "/global/AGENTS.md", content: "global" },
        { path: "/repo/AGENTS.md", content: "root agents" },
        { path: "/repo/a/CLAUDE.md", content: "a claude" },
        { path: "/repo/a/b/AGENTS.md", content: "b agents" },
      ])
    }).pipe(Effect.provide(Layer.mergeAll(testFsLayer(files), Path.layer)))
  })

  it.effect("supports custom filenames and skips missing files", () => {
    const files = {
      "/repo/a/NOTES.md": "notes",
    }
    return Effect.gen(function* () {
      const loaded = yield* InstructionFiles.loadInstructionFiles({ cwd: "/repo/a", filenames: ["NOTES.md"] })

      expect(loaded).toEqual([{ path: "/repo/a/NOTES.md", content: "notes" }])
    }).pipe(Effect.provide(Layer.mergeAll(testFsLayer(files), Path.layer)))
  })
})
