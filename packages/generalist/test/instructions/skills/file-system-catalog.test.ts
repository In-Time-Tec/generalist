import { layer as bunServicesLayer } from "@effect/platform-bun/BunServices"
import { describe, expect, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Option, Path, PlatformError, Stream } from "effect"
import { SkillCatalog } from "generalist"
import { FileSystemCatalog } from "../../../src/instructions/skills/index"

const encoder = new TextEncoder()

const testFileInfo = (type: FileSystem.File.Type): FileSystem.File.Info => ({
  type,
  mtime: Option.none(),
  atime: Option.none(),
  birthtime: Option.none(),
  dev: 0,
  ino: Option.none(),
  mode: 0,
  nlink: Option.none(),
  uid: Option.none(),
  gid: Option.none(),
  rdev: Option.none(),
  size: FileSystem.Size(0),
  blksize: Option.none(),
  blocks: Option.none(),
})

interface ReadCounts {
  readonly full: Record<string, number>
  readonly streamed: Record<string, number>
}

const notFound = (method: string, path: string) =>
  PlatformError.systemError({
    _tag: "NotFound",
    module: "FileSystemCatalogTest",
    method,
    description: "not found",
    pathOrDescriptor: path,
  })

const testFsLayer = (
  files: Readonly<Record<string, string>>,
  directories: Readonly<Record<string, ReadonlyArray<string>>>,
  reads: ReadCounts = { full: {}, streamed: {} },
  nonFiles: ReadonlyArray<string> = [],
) =>
  FileSystem.layerNoop({
    exists: (path) => Effect.succeed(path in files || path in directories || nonFiles.includes(path)),
    readDirectory: (path) => {
      const entries = directories[path]
      return entries === undefined ? Effect.fail(notFound("readDirectory", path)) : Effect.succeed([...entries])
    },
    readFileString: (path) => {
      const content = files[path]
      return content === undefined
        ? Effect.fail(notFound("readFileString", path))
        : Effect.sync(() => {
            reads.full[path] = (reads.full[path] ?? 0) + 1
            return content
          })
    },
    stream: (path, options) => {
      const content = files[path]
      return content === undefined
        ? Stream.fail(notFound("stream", path))
        : Stream.sync(() => {
            reads.streamed[path] = (reads.streamed[path] ?? 0) + 1
            const bytesToRead = Number(options?.bytesToRead ?? content.length)
            return encoder.encode(content.slice(0, bytesToRead))
          })
    },
    stat: (path) => {
      if (nonFiles.includes(path)) return Effect.succeed(testFileInfo("Directory"))
      if (path in files) return Effect.succeed(testFileInfo("File"))
      return Effect.fail(notFound("stat", path))
    },
  })

const loaderTestLayer = (
  options: Parameters<typeof FileSystemCatalog.layer>[0],
  files: Readonly<Record<string, string>>,
  directories: Readonly<Record<string, ReadonlyArray<string>>>,
  reads?: ReadCounts,
  nonFiles?: ReadonlyArray<string>,
) =>
  FileSystemCatalog.layer(options).pipe(
    Layer.provide(Layer.mergeAll(testFsLayer(files, directories, reads, nonFiles), Path.layer)),
  )

const provideTestLayer =
  <R, E, RIn>(layer: Layer.Layer<R, E, RIn>) =>
  <A, E2, R2>(effect: Effect.Effect<A, E2, R | R2>) =>
    Layer.build(layer).pipe(Effect.flatMap((context) => Effect.provide(effect, context)))

describe("FileSystemCatalog", () => {
  it.effect("parses frontmatter and leaves body lazy", () => {
    const reads: ReadCounts = { full: {}, streamed: {} }
    const path = "/repo/.agents/skills/review/SKILL.md"
    const files = {
      [path]: `---
name: review
description: Review code carefully
when-to-use: before merging
allowed-tools: read grep
disableModelInvocation: false
userInvocable: true
contextFork: true
paths: ["packages/core/**", "docs/features/**"]
---
# Review body
Use the checklist.
`,
    }
    const directories = { "/repo/.agents/skills": ["review/SKILL.md"] }
    return Effect.gen(function* () {
      const source = yield* SkillCatalog.SkillCatalog
      const all = yield* source.all
      const found = yield* source.get("review")

      expect(all).toHaveLength(1)
      expect(found).toBe(all[0])
      expect(all[0]).toMatchObject({
        name: "review",
        description: "Review code carefully",
        whenToUse: "before merging",
        allowedTools: ["read", "grep"],
        disableModelInvocation: false,
        userInvocable: true,
        contextFork: true,
        paths: ["packages/core/**", "docs/features/**"],
      })
      expect(reads.streamed[path]).toBe(1)
      expect(reads.full[path]).toBeUndefined()

      const body = yield* all[0]!.instructions

      expect(body).toContain("# Review body")
      expect(reads.full[path]).toBe(1)
    }).pipe(provideTestLayer(loaderTestLayer({ cwd: "/repo", roots: [".agents/skills"] }, files, directories, reads)))
  })

  it.effect("uses standard names for nested skills and lets later roots win collisions", () => {
    const files = {
      "/repo/a/frontend/lint/SKILL.md": `---
name: lint
description: Lint frontend
---
body a`,
      "/repo/a/dup/SKILL.md": `---
name: dup
description: First duplicate
---
body first`,
      "/repo/b/dup/SKILL.md": `---
name: dup
description: Second duplicate
---
body second`,
    }
    const directories = {
      "/repo/a": ["frontend/lint/SKILL.md", "dup/SKILL.md"],
      "/repo/b": ["dup/SKILL.md"],
    }
    return Effect.gen(function* () {
      const source = yield* SkillCatalog.SkillCatalog
      const all = yield* source.all
      const nested = yield* source.get("lint")
      const duplicate = yield* source.get("dup")

      expect(all.map((skill) => skill.name)).toEqual(["dup", "lint"])
      expect(nested?.description).toBe("Lint frontend")
      expect(duplicate?.description).toBe("Second duplicate")
    }).pipe(provideTestLayer(loaderTestLayer({ cwd: "/repo", roots: ["a", "b"] }, files, directories)))
  })

  it.effect("fails typed for invalid frontmatter and keeps user-only skills addressable", () => {
    const files = {
      "/repo/skills/user-only/SKILL.md": `---
name: user-only
description: User only
disableModelInvocation: true
---
body`,
      "/repo/skills/bad/SKILL.md": `---
name: bad
---
body`,
    }
    const directories = { "/repo/skills": ["user-only/SKILL.md", "bad/SKILL.md"] }
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(
        SkillCatalog.SkillCatalog.pipe(
          provideTestLayer(loaderTestLayer({ cwd: "/repo", roots: ["skills"] }, files, directories)),
        ),
      )

      expect(failure._tag).toBe("generalist/core/SkillCatalogError")

      const goodSource = yield* SkillCatalog.SkillCatalog.pipe(
        provideTestLayer(
          loaderTestLayer(
            { cwd: "/repo", roots: ["skills"] },
            {
              "/repo/skills/user-only/SKILL.md": files["/repo/skills/user-only/SKILL.md"] ?? "",
            },
            { "/repo/skills": ["user-only/SKILL.md"] },
          ),
        ),
      )
      const userOnly = yield* goodSource.get("user-only")

      expect(userOnly).toBeDefined()
      expect(SkillCatalog.selectListings(userOnly === undefined ? [] : [userOnly], 1_000, [])).toEqual([])
    })
  })

  it.effect("enforces required standard name, directory equality, and description length", () => {
    const cases = [
      {
        file: "/repo/skills/missing/SKILL.md",
        content: `---
description: Missing name
---
body`,
      },
      {
        file: "/repo/skills/directory/SKILL.md",
        content: `---
name: different
description: Mismatched directory
---
body`,
      },
      {
        file: "/repo/skills/invalid/SKILL.md",
        content: `---
name: Invalid_Name
description: Invalid name
---
body`,
      },
      {
        file: "/repo/skills/double--dash/SKILL.md",
        content: `---
name: double--dash
description: Consecutive hyphens are invalid
---
body`,
      },
      {
        file: "/repo/skills/long/SKILL.md",
        content: `---
name: long
description: ${"x".repeat(1025)}
---
body`,
      },
    ]
    return Effect.gen(function* () {
      for (const testCase of cases) {
        const relative = testCase.file.slice("/repo/skills/".length)
        const failure = yield* Effect.flip(
          SkillCatalog.SkillCatalog.pipe(
            provideTestLayer(
              loaderTestLayer(
                { cwd: "/repo", roots: ["skills"] },
                { [testCase.file]: testCase.content },
                { "/repo/skills": [relative] },
              ),
            ),
          ),
        )
        expect(failure._tag).toBe("generalist/core/SkillCatalogError")
      }
    })
  })

  it.effect("skips a directory named SKILL.md and keeps valid siblings", () => {
    const reads: ReadCounts = { full: {}, streamed: {} }
    const goodFile = "/repo/skills/good/SKILL.md"
    const files = {
      [goodFile]: `---
name: good
description: Good
---
body`,
    }
    const directories = {
      "/repo/skills": ["good", "good/SKILL.md", "notes", "notes/SKILL.md", "notes/SKILL.md/inner.txt"],
    }
    const nonFiles = ["/repo/skills/notes/SKILL.md"]
    return Effect.gen(function* () {
      const source = yield* SkillCatalog.SkillCatalog
      const all = yield* source.all

      expect(all.map((skill) => skill.name)).toEqual(["good"])
      expect(yield* source.get("notes")).toBeUndefined()
      expect(reads.streamed[goodFile]).toBe(1)
      expect(reads.full[goodFile]).toBeUndefined()
    }).pipe(provideTestLayer(loaderTestLayer({ cwd: "/repo", roots: ["skills"] }, files, directories, reads, nonFiles)))
  })

  it.effect("skips a real directory named SKILL.md and discovers the valid sibling", () =>
    provideTestLayer(bunServicesLayer)(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const root = yield* fs.makeTempDirectoryScoped()
        yield* fs.makeDirectory(path.join(root, ".agents/skills/good"), { recursive: true })
        yield* fs.writeFileString(
          path.join(root, ".agents/skills/good/SKILL.md"),
          "---\nname: good\ndescription: Good\n---\nbody",
        )
        yield* fs.makeDirectory(path.join(root, ".agents/skills/notes/SKILL.md"), { recursive: true })
        yield* fs.writeFileString(path.join(root, ".agents/skills/notes/SKILL.md/inner.txt"), "inner")

        const catalog = yield* FileSystemCatalog.make({ cwd: root })
        const all = yield* catalog.all

        expect(all.map((skill) => skill.name)).toEqual(["good"])
      }).pipe(Effect.scoped),
    ),
  )
})
