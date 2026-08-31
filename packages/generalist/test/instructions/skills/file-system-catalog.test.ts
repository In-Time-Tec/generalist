import { describe, expect, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path, PlatformError, Stream } from "effect"
import { SkillCatalog } from "generalist"
import { FileSystemCatalog } from "../../../src/instructions/skills/index"

const encoder = new TextEncoder()

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
) =>
  FileSystem.layerNoop({
    exists: (path) => Effect.succeed(path in files || path in directories),
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
  })

const loaderTestLayer = (
  options: Parameters<typeof FileSystemCatalog.layer>[0],
  files: Readonly<Record<string, string>>,
  directories: Readonly<Record<string, ReadonlyArray<string>>>,
  reads?: ReadCounts,
) =>
  FileSystemCatalog.layer(options).pipe(
    Layer.provide(Layer.mergeAll(testFsLayer(files, directories, reads), Path.layer)),
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
})
