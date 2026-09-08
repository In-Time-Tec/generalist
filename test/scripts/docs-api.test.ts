import { layer as bunLayer } from "@effect/platform-bun/BunServices"
import { describe, expect, it as test, layer } from "@effect/vitest"
import { Effect, FileSystem, Path, Schema, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { normalizeMarkdownLinks } from "../../scripts/docs-api.js"

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Json))

describe("generated API Markdown links", () => {
  test("retains exact Markdown filenames and TypeDoc anchors for dotted module names", () => {
    expect(normalizeMarkdownLinks("[`Bucket`](durability.r2.md#bucket)")).toBe("[`Bucket`](./durability.r2.md#bucket)")
    expect(normalizeMarkdownLinks("[Runtime](runtime/namespaces/Runtime.md#runtime)")).toBe(
      "[Runtime](./runtime/namespaces/Runtime.md#runtime)",
    )
  })

  test("preserves existing relative paths, same-page anchors, and absolute URLs", () => {
    const source = [
      "[Sibling](./durability.r2.md#bucket)",
      "[Parent](../../durability.md#options)",
      "[Local](#bucket)",
      "[Root](/api/durability.r2.md#bucket)",
      "[External](https://example.com/reference.md#bucket)",
    ].join("\n")
    expect(normalizeMarkdownLinks(source)).toBe(source)
    expect(normalizeMarkdownLinks(normalizeMarkdownLinks("[Index](index.md)"))).toBe("[Index](./index.md)")
  })
})

layer(bunLayer)("Mintlify generated API link resolution", (it) => {
  it.effect("rejects ambiguous dotted targets in either order while preserving exact and unique targets", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const directory = yield* fs.makeTempDirectoryScoped()
      const mint = yield* fs.realPath(path.resolve("docs/node_modules/mint/index.js"))
      yield* fs.makeDirectory(path.join(directory, "api"))
      yield* fs.writeFileString(path.join(directory, "api/durability.md"), "# Durability\n\n## Options\n")
      yield* fs.writeFileString(path.join(directory, "api/durability.r2.md"), "# R2\n\n### Bucket\n")
      yield* fs.writeFileString(
        path.join(directory, "resolution.mjs"),
        `import { createRequire } from "node:module"
const cli = createRequire(${encodeJson(mint)}).resolve("@mintlify/cli")
const { MdxPath } = await import(createRequire(cli).resolve("@mintlify/link-rot/dist/graph.js"))
const candidates = ["api/durability.md", "api/durability.r2.md"]
const ambiguous = new MdxPath("./durability.r2#bucket", "api", "host.md")
const exact = new MdxPath("./durability.r2.md#bucket", "api", "host.md")
const unique = new MdxPath("./durability.r2#bucket", "api", "host.md")
console.log(JSON.stringify([
  ambiguous.getResolvedFiles(candidates, process.cwd()),
  ambiguous.getResolvedFiles([...candidates].reverse(), process.cwd()),
  exact.getResolvedFiles([...candidates, "api/durability.r2.md", "api/durability.r2.mdx"], process.cwd()),
  unique.getResolvedFiles(["api/durability.r2.md", "api/durability.r2.md"], process.cwd()),
]))
`,
      )
      const process = yield* spawner.spawn(ChildProcess.make("bun", ["resolution.mjs"], { cwd: directory }))
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [
          Stream.mkString(Stream.decodeText(process.stdout)),
          Stream.mkString(Stream.decodeText(process.stderr)),
          process.exitCode,
        ],
        { concurrency: 3 },
      )
      expect(Number(exitCode), stderr).toBe(0)
      expect(stdout.trim()).toBe(encodeJson([[], [], ["api/durability.r2.md"], ["api/durability.r2.md"]]))
    }),
  )

  it.effect("checks the exact dotted target and still rejects a missing anchor", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const directory = yield* fs.makeTempDirectoryScoped()
      const mint = path.resolve("docs/node_modules/mint/index.js")
      yield* fs.makeDirectory(path.join(directory, "api"))
      yield* fs.writeFileString(
        path.join(directory, "docs.json"),
        '{"$schema":"https://mintlify.com/docs.json","theme":"mint","name":"API link test","colors":{"primary":"#5B5BD6"},"navigation":{"groups":[{"group":"API","pages":["api/durability","api/durability.r2","api/host"]}]}}',
      )
      yield* fs.writeFileString(path.join(directory, "api/durability.md"), "# Durability\n\n## Options\n")
      yield* fs.writeFileString(
        path.join(directory, "api/durability.r2.md"),
        '# R2\n\n<a id="bucket"></a>\n\n### Bucket\n',
      )

      for (const [link, expectedExitCode] of [
        ["[Bucket](./durability.r2#bucket)", 1],
        [normalizeMarkdownLinks("[Bucket](durability.r2.md#bucket)"), 0],
        [normalizeMarkdownLinks("[Missing](durability.r2.md#missing)"), 1],
      ] as const) {
        yield* fs.writeFileString(path.join(directory, "api/host.md"), `# Host\n\n${link}\n`)
        const process = yield* spawner.spawn(
          ChildProcess.make("bun", [mint, "broken-links", "--check-anchors", "--check-redirects"], {
            cwd: directory,
            env: { MINTLIFY_TELEMETRY_DISABLED: "1" },
            extendEnv: true,
          }),
        )
        const [stdout, stderr, exitCode] = yield* Effect.all(
          [
            Stream.mkString(Stream.decodeText(process.stdout)),
            Stream.mkString(Stream.decodeText(process.stderr)),
            process.exitCode,
          ],
          { concurrency: 3 },
        )
        expect(Number(exitCode), `${link}\n${stdout}${stderr}`).toBe(expectedExitCode)
        expect(`${stdout}${stderr}`).toContain(expectedExitCode === 0 ? "no broken links found" : "broken links")
      }
    }),
  )
})
