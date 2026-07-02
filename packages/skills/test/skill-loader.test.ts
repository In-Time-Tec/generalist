import { describe, expect, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path, PlatformError, Stream } from "effect"
import { SkillSource } from "@batonfx/core"
import { SkillLoader } from "../src/index"

const encoder = new TextEncoder()

interface ReadCounts {
  readonly full: Record<string, number>
  readonly streamed: Record<string, number>
}

const notFound = (method: string, path: string) =>
  PlatformError.systemError({
    _tag: "NotFound",
    module: "SkillLoaderTest",
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
  options: Parameters<typeof SkillLoader.layer>[0],
  files: Readonly<Record<string, string>>,
  directories: Readonly<Record<string, ReadonlyArray<string>>>,
  reads?: ReadCounts,
) => SkillLoader.layer(options).pipe(Layer.provide(Layer.mergeAll(testFsLayer(files, directories, reads), Path.layer)))

describe("SkillLoader", () => {
  it.effect("parses frontmatter and leaves body lazy", () => {
    const reads: ReadCounts = { full: {}, streamed: {} }
    const path = "/repo/.agents/skills/review/SKILL.md"
    const files = {
      [path]: `---
name: review
description: Review code carefully
when-to-use: before merging
allowedTools:
  - read
  - grep
disableModelInvocation: false
userInvocable: true
contextFork: true
agent: reviewer
model: fast
paths: ["packages/core/**", "docs/spec/**"]
---
# Review body
Use the checklist.
`,
    }
    const directories = { "/repo/.agents/skills": ["review/SKILL.md"] }
    return Effect.gen(function* () {
      const source = yield* SkillSource.SkillSource
      const all = yield* source.all
      const found = yield* source.get("review")

      expect(all).toHaveLength(1)
      expect(found).toBe(all[0])
      expect(all[0]?.frontmatter).toMatchObject({
        name: "review",
        description: "Review code carefully",
        whenToUse: "before merging",
        allowedTools: ["read", "grep"],
        disableModelInvocation: false,
        userInvocable: true,
        contextFork: true,
        agent: "reviewer",
        model: "fast",
        paths: ["packages/core/**", "docs/spec/**"],
      })
      expect(all[0]?.listing).toBe("- review: Review code carefully")
      expect(reads.streamed[path]).toBe(1)
      expect(reads.full[path]).toBeUndefined()

      const body = yield* all[0]!.body

      expect(body).toContain("# Review body")
      expect(reads.full[path]).toBe(1)
    }).pipe(Effect.provide(loaderTestLayer({ cwd: "/repo", roots: [".agents/skills"] }, files, directories, reads)))
  })

  it.effect("defaults names, namespaces nested skills, and lets later roots win collisions", () => {
    const files = {
      "/repo/a/frontend/lint/SKILL.md": `---
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
      const source = yield* SkillSource.SkillSource
      const all = yield* source.all
      const nested = yield* source.get("frontend:lint")
      const duplicate = yield* source.get("dup")

      expect(all.map((skill) => skill.frontmatter.name)).toEqual(["dup", "frontend:lint"])
      expect(nested?.frontmatter.description).toBe("Lint frontend")
      expect(duplicate?.frontmatter.description).toBe("Second duplicate")
    }).pipe(Effect.provide(loaderTestLayer({ cwd: "/repo", roots: ["a", "b"] }, files, directories)))
  })

  it.effect("fails typed for invalid frontmatter and keeps user-only skills addressable", () => {
    const files = {
      "/repo/skills/user-only/SKILL.md": `---
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
        SkillSource.SkillSource.pipe(
          Effect.provide(loaderTestLayer({ cwd: "/repo", roots: ["skills"] }, files, directories)),
        ),
      )

      expect(failure._tag).toBe("@batonfx/core/SkillSourceError")

      const goodSource = yield* SkillSource.SkillSource.pipe(
        Effect.provide(
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
      expect(SkillSource.selectListings(userOnly === undefined ? [] : [userOnly], 1_000, [])).toEqual([])
    })
  })
})
