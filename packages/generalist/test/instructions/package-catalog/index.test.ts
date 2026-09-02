import { BunServices } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import { Context, Crypto, Effect, Encoding, FileSystem, Layer, Path, Schema } from "effect"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import { Response as AiResponse } from "effect/unstable/ai"
import { ToolContext, ToolExecutor } from "../../../src/index.js"
import { PackageCatalog } from "../../../src/instructions/index.js"

const fixtureRoot = "examples/packages/generalist-skills-example"
const registry = "https://registry.example"
const github = "https://github.example"
const packageName = "@in-time-tec/generalist-skills-example"
const npmSpecifier = `${packageName}@^1`
const commit = "a".repeat(40)
const stringify = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

interface TarFile {
  readonly path: string
  readonly content: Uint8Array
}

const writeText = (target: Uint8Array, offset: number, length: number, value: string): void => {
  target.set(new TextEncoder().encode(value).subarray(0, length), offset)
}

const tar = (files: ReadonlyArray<TarFile>, root: string): Uint8Array => {
  const chunks: Array<Uint8Array> = []
  for (const file of files) {
    const header = new Uint8Array(512)
    writeText(header, 0, 100, `${root}/${file.path}`)
    writeText(header, 100, 8, "0000644\0")
    writeText(header, 108, 8, "0000000\0")
    writeText(header, 116, 8, "0000000\0")
    writeText(header, 124, 12, `${file.content.byteLength.toString(8).padStart(11, "0")}\0`)
    writeText(header, 136, 12, "00000000000\0")
    header.fill(32, 148, 156)
    header[156] = "0".charCodeAt(0)
    writeText(header, 257, 6, "ustar\0")
    const checksum = header.reduce((sum, byte) => sum + byte, 0)
    writeText(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `)
    const body = new Uint8Array(Math.ceil(file.content.byteLength / 512) * 512)
    body.set(file.content)
    chunks.push(header, body)
  }
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 1024)
  const archive = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    archive.set(chunk, offset)
    offset += chunk.byteLength
  }
  return archive
}

const fixtureArchive = Effect.fn("fixtureArchive")(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const entries = ["AGENTS.md", "package.json", "skills/review/SKILL.md", "tools.js"]
  const files: Array<TarFile> = []
  for (const entry of entries) {
    const source = path.join(fixtureRoot, entry)
    files.push({ path: entry, content: yield* fs.readFile(source) })
  }
  return tar(files, "package")
})

const sri = Effect.fn("sri")(function* (archive: Uint8Array) {
  const crypto = yield* Crypto.Crypto
  return `sha512-${Encoding.encodeBase64(yield* crypto.digest("SHA-512", archive))}`
})

const httpLayer = (
  responses: Readonly<Record<string, string | Uint8Array>>,
  requests: Array<string>,
): Layer.Layer<HttpClient.HttpClient> =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, url) => {
      const target = url.toString()
      requests.push(target)
      const body = responses[target]
      const responseBody = body instanceof Uint8Array ? body.slice().buffer : (body ?? "missing")
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(responseBody, {
            status: body === undefined ? 404 : 200,
          }),
        ),
      )
    }),
  )

const paths = Effect.fn("testPaths")(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = yield* fs.makeTempDirectoryScoped({
    directory: "packages/generalist/test/instructions/package-catalog",
    prefix: "catalog-",
  })
  return { cacheDir: path.join(root, "cache"), lock: path.join(root, "packages.lock") }
})

const load = (
  options: PackageCatalog.Options,
  responses: Readonly<Record<string, string | Uint8Array>>,
  requests: Array<string>,
) =>
  Layer.build(
    PackageCatalog.layer(options).pipe(Layer.provide(Layer.merge(BunServices.layer, httpLayer(responses, requests)))),
  ).pipe(Effect.flatMap((context) => Effect.provide(PackageCatalog.PackageCatalog, context)))

describe("PackageCatalog", () => {
  it.layer(BunServices.layer)((test) => {
    test.effect("resolves an npm range and exposes package instructions, skills, and opt-in tools", () =>
      Effect.gen(function* () {
        const archive = yield* fixtureArchive()
        const integrity = yield* sri(archive)
        const tarball = `${registry}/archive.tgz`
        const metadata = stringify({
          "dist-tags": { latest: "2.0.0" },
          versions: {
            "1.0.0": { name: packageName, version: "1.0.0", dist: { tarball, integrity } },
            "2.0.0": { name: packageName, version: "2.0.0", dist: { tarball, integrity } },
          },
        })
        const temp = yield* paths()
        const requests: Array<string> = []
        const catalog = yield* load(
          { packages: [npmSpecifier], ...temp, allowTools: true, npmRegistryUrl: registry },
          { [`${registry}/${encodeURIComponent(packageName)}`]: metadata, [tarball]: archive },
          requests,
        )

        expect(catalog.instructions.map((provider) => provider.id)).toEqual([`${packageName}:AGENTS.md`])
        expect((yield* catalog.skills.all).map((skill) => skill.name)).toEqual(["review"])
        expect(Object.keys(catalog.toolkit.tools)).toEqual(["package_echo"])
        expect(Layer.isLayer(catalog.executorLayer)).toBe(true)
        expect(requests).toEqual([`${registry}/${encodeURIComponent(packageName)}`, tarball])

        const toolContext = yield* Layer.build(Layer.merge(catalog.executorLayer, ToolContext.layerDefault))
        const executor = Context.get(toolContext, ToolExecutor.ToolExecutor)
        const call = AiResponse.toolCallPart<"package_echo", { readonly text: string }>({
          id: "package-echo-1",
          name: "package_echo",
          params: { text: "installed" },
          providerExecuted: false,
        })
        const outcome = yield* executor
          .execute({
            call,
            toolCallBatch: { calls: [call] },
            turn: 0,
            toolCallIndex: 0,
            agentName: "package-catalog-test",
            sessionId: "package-catalog-test",
          })
          .pipe(Effect.provideService(ToolContext.ToolContext, Context.get(toolContext, ToolContext.ToolContext)))
        expect(outcome).toMatchObject({ _tag: "Success", result: "installed" })

        const fs = yield* FileSystem.FileSystem
        const lock = yield* fs.readFileString(temp.lock)
        expect(lock).toContain('"resolved":"1.0.0"')
        expect(lock).toContain(integrity)
      }),
    )

    test.effect("does not import declared package tools unless allowTools is true", () =>
      Effect.gen(function* () {
        const archive = yield* fixtureArchive()
        const integrity = yield* sri(archive)
        const tarball = `${registry}/disabled.tgz`
        const metadata = stringify({
          "dist-tags": { latest: "1.0.0" },
          versions: { "1.0.0": { name: packageName, version: "1.0.0", dist: { tarball, integrity } } },
        })
        const temp = yield* paths()
        const catalog = yield* load(
          { packages: [npmSpecifier], ...temp, npmRegistryUrl: registry },
          { [`${registry}/${encodeURIComponent(packageName)}`]: metadata, [tarball]: archive },
          [],
        )

        expect(Object.keys(catalog.toolkit.tools)).toEqual([])
        expect((yield* catalog.skills.get("review"))?.tools).toEqual([])
      }),
    )

    test.effect("resolves a GitHub ref to an immutable commit archive", () =>
      Effect.gen(function* () {
        const archive = yield* fixtureArchive()
        const specifier = "github:in-time-tec/generalist-skills-example#v1"
        const commitUrl = `${github}/repos/in-time-tec/generalist-skills-example/commits/v1`
        const archiveUrl = `${github}/repos/in-time-tec/generalist-skills-example/tarball/${commit}`
        const temp = yield* paths()
        const requests: Array<string> = []
        const catalog = yield* load(
          { packages: [specifier], ...temp, githubApiUrl: github },
          { [commitUrl]: stringify({ sha: commit }), [archiveUrl]: archive },
          requests,
        )

        expect((yield* catalog.skills.all).map((skill) => skill.name)).toEqual(["review"])
        expect(requests).toEqual([commitUrl, archiveUrl])
        const fs = yield* FileSystem.FileSystem
        expect(yield* fs.readFileString(temp.lock)).toContain(commit)
      }),
    )

    test.effect("fails with PackageIntegrityMismatch when a cached archive changes", () =>
      Effect.gen(function* () {
        const archive = yield* fixtureArchive()
        const integrity = yield* sri(archive)
        const tarball = `${registry}/integrity.tgz`
        const metadata = stringify({
          "dist-tags": { latest: "1.0.0" },
          versions: { "1.0.0": { name: packageName, version: "1.0.0", dist: { tarball, integrity } } },
        })
        const temp = yield* paths()
        yield* load(
          { packages: [npmSpecifier], ...temp, npmRegistryUrl: registry },
          { [`${registry}/${encodeURIComponent(packageName)}`]: metadata, [tarball]: archive },
          [],
        )
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const cached = (yield* fs.readDirectory(temp.cacheDir)).find((entry) => entry.endsWith(".tgz"))!
        yield* fs.writeFile(path.join(temp.cacheDir, cached), new TextEncoder().encode("changed"))

        const failure = yield* Effect.flip(
          load({ packages: [npmSpecifier], ...temp, npmRegistryUrl: registry }, {}, []),
        )
        expect(failure._tag).toBe("PackageIntegrityMismatch")
        if (failure._tag === "PackageIntegrityMismatch") expect(failure.specifier).toBe(npmSpecifier)
      }),
    )

    test.effect("Schema-validates the lock file and rejects a changed package list", () =>
      Effect.gen(function* () {
        const temp = yield* paths()
        const fs = yield* FileSystem.FileSystem
        yield* fs.writeFileString(temp.lock, stringify({ version: 1, packages: [] }))
        const failure = yield* Effect.flip(load({ packages: [npmSpecifier], ...temp }, {}, []))
        expect(failure._tag).toBe("PackageIntegrityMismatch")

        yield* fs.writeFileString(temp.lock, stringify({ version: 2, packages: [] }))
        const invalid = yield* Effect.flip(load({ packages: [], ...temp }, {}, []))
        expect(invalid._tag).toBe("PackageCatalogError")
        if (invalid._tag === "PackageCatalogError") expect(invalid.message).toBe("Invalid package lock file")
      }),
    )
  })
})
