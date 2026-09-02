import { Context, Crypto, Effect, Encoding, FileSystem, Layer, Path, PlatformError, Predicate, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { Tool, Toolkit } from "effect/unstable/ai"
import type { Service as SkillService, Skill } from "../../core/context/skill-catalog.js"
import { type ToolExecutor, layerToolkit as toolExecutorLayerToolkit } from "../../core/tools/tool-executor.js"
import type { Provider } from "../providers.js"
import { parseDocument } from "../skills/document.js"
import { extractArchive } from "./archive.js"
import { PackageCatalogError, PackageIntegrityMismatch } from "./errors.js"
import { commitCodec, LockEntry, lockCodec, manifestCodec, registryCodec } from "./wire.js"
export { PackageCatalogError, PackageIntegrityMismatch } from "./errors.js"

type PackageTool = Tool.Tool<
  string,
  {
    readonly parameters: typeof Schema.Unknown
    readonly success: typeof Schema.Unknown
    readonly failure: typeof Schema.Unknown
    readonly failureMode: Tool.FailureMode
  },
  never
>

const PackageToolkit = Schema.declare(
  (input): input is Toolkit.Toolkit<Record<string, PackageTool>> =>
    Predicate.isFunction(input) &&
    "tools" in input &&
    Predicate.isObject(input.tools) &&
    Object.values(input.tools).every((tool) => Predicate.hasProperty(tool, Tool.TypeId)),
)

const PackageHandlerLayer = Schema.declare((input): input is Layer.Layer<Tool.Handler<string>> => Layer.isLayer(input))

/** @experimental Package catalog configuration. */
export interface Options {
  readonly packages: ReadonlyArray<string>
  readonly cacheDir: string
  readonly lock: string
  readonly allowTools?: boolean
  readonly npmRegistryUrl?: string
  readonly githubApiUrl?: string
}

/** @experimental A resolved package catalog. */
export interface Service {
  readonly instructions: ReadonlyArray<Provider>
  readonly skills: SkillService
  readonly toolkit: Toolkit.Toolkit<Record<string, PackageTool>>
  readonly executorLayer: Layer.Layer<ToolExecutor>
}

/** @experimental */
export class PackageCatalog extends Context.Service<PackageCatalog, Service>()(
  "generalist/instructions/package-catalog/PackageCatalog",
) {}

const catalogError = (source: string, message: string, cause?: unknown): PackageCatalogError =>
  cause === undefined
    ? PackageCatalogError.make({ source, message })
    : PackageCatalogError.make({ source, message, cause })

const platformError = (source: string, error: PlatformError.PlatformError): PackageCatalogError =>
  catalogError(source, error.message, error)

const decoder = new TextDecoder("utf-8", { fatal: true })

const decodeText = (source: string, bytes: Uint8Array): Effect.Effect<string, PackageCatalogError> =>
  Effect.try({
    try: () => decoder.decode(bytes),
    catch: (cause) => catalogError(source, "Package content is not valid UTF-8", cause),
  })

const fetchBytes = Effect.fn("PackageCatalog.fetchBytes")(function* (
  client: HttpClient.HttpClient,
  url: string,
  accept: string,
) {
  const request = HttpClientRequest.get(url).pipe(HttpClientRequest.setHeader("accept", accept))
  const response = yield* client.execute(request).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.mapError((cause) => catalogError(url, "Package request failed", cause)),
  )
  const body = yield* response.arrayBuffer.pipe(
    Effect.mapError((cause) => catalogError(url, "Unable to read package response", cause)),
  )
  return new Uint8Array(body)
})

const digest = Effect.fn("PackageCatalog.digest")(function* (algorithm: "SHA-256" | "SHA-512", bytes: Uint8Array) {
  const crypto = yield* Crypto.Crypto
  return yield* crypto
    .digest(algorithm, bytes)
    .pipe(Effect.mapError((cause) => catalogError("package-integrity", "Unable to hash package archive", cause)))
})

const verifyIntegrity = Effect.fn("PackageCatalog.verifyIntegrity")(function* (
  specifier: string,
  expected: string,
  bytes: Uint8Array,
) {
  const separator = expected.indexOf("-")
  const algorithm = expected.slice(0, separator)
  const encoded = expected.slice(separator + 1)
  if ((algorithm !== "sha256" && algorithm !== "sha512") || encoded.length === 0) {
    return yield* catalogError(specifier, "Package integrity must be sha256 or sha512 SRI")
  }
  const actualBytes = yield* digest(algorithm === "sha256" ? "SHA-256" : "SHA-512", bytes)
  const actual = `${algorithm}-${Encoding.encodeBase64(actualBytes)}`
  if (actual !== expected) {
    return yield* PackageIntegrityMismatch.make({ specifier, expected, actual })
  }
})

interface NpmSpec {
  readonly name: string
  readonly selector: string
}

const parseNpmSpec = (specifier: string): NpmSpec | undefined => {
  if (specifier.startsWith("github:")) return undefined
  if (specifier.startsWith("@")) {
    const separator = specifier.indexOf("@", 1)
    return separator === -1
      ? { name: specifier, selector: "latest" }
      : { name: specifier.slice(0, separator), selector: specifier.slice(separator + 1) || "latest" }
  }
  const separator = specifier.lastIndexOf("@")
  return separator <= 0
    ? { name: specifier, selector: "latest" }
    : { name: specifier.slice(0, separator), selector: specifier.slice(separator + 1) || "latest" }
}

const versionParts = (version: string): readonly [number, number, number] | undefined => {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(version)
  return match === null ? undefined : [Number(match[1]), Number(match[2]), Number(match[3])]
}

const selectedPart = (value: string | undefined): number | undefined =>
  value === undefined || value === "x" || value === "*" ? undefined : Number(value)

const matchesCaret = (
  parts: readonly [number, number, number],
  major: number,
  minor: number,
  patch: number | undefined,
): boolean => {
  if (major > 0) return parts[1] > minor || (parts[1] === minor && (patch === undefined || parts[2] >= patch))
  return parts[1] === minor && (patch === undefined || parts[2] >= patch)
}

const versionMatches = (version: string, selector: string): boolean => {
  const parts = versionParts(version)
  if (parts === undefined) return false
  if (selector === "*" || selector === "latest") return true
  if (/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(selector)) return version === selector
  const normalized = selector.replace(/^[~^]/, "").split(".")
  const major = Number(normalized[0])
  const minor = selectedPart(normalized[1])
  const patch = selectedPart(normalized[2])
  if (!Number.isSafeInteger(major) || parts[0] !== major) return false
  if (minor === undefined) return true
  if (!Number.isSafeInteger(minor)) return false
  if (selector.startsWith("^")) return matchesCaret(parts, major, minor, patch)
  if (parts[1] !== minor) return false
  if (patch === undefined) return true
  if (!Number.isSafeInteger(patch)) return false
  return selector.startsWith("~") ? parts[2] >= patch : parts[2] === patch
}

const compareVersions = (left: string, right: string): number => {
  const a = versionParts(left) ?? [0, 0, 0]
  const b = versionParts(right) ?? [0, 0, 0]
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

const resolveNpm = Effect.fn("PackageCatalog.resolveNpm")(function* (
  client: HttpClient.HttpClient,
  registryUrl: string,
  specifier: string,
  parsed: NpmSpec,
) {
  const metadataUrl = `${registryUrl.replace(/\/$/, "")}/${encodeURIComponent(parsed.name)}`
  const metadataText = yield* fetchBytes(client, metadataUrl, "application/vnd.npm.install-v1+json").pipe(
    Effect.flatMap((bytes) => decodeText(specifier, bytes)),
  )
  const metadata = yield* Schema.decodeEffect(registryCodec)(metadataText).pipe(
    Effect.mapError((cause) => catalogError(specifier, "Invalid npm registry metadata", cause)),
  )
  const tagged = metadata["dist-tags"][parsed.selector]
  const resolved =
    tagged ??
    Object.keys(metadata.versions)
      .filter((version) => versionMatches(version, parsed.selector))
      .toSorted(compareVersions)
      .at(-1)
  if (resolved === undefined) return yield* catalogError(specifier, `No npm version matches ${parsed.selector}`)
  const entry = metadata.versions[resolved]
  if (entry === undefined) return yield* catalogError(specifier, `npm metadata is missing version ${resolved}`)
  return LockEntry.make({
    specifier,
    source: "npm",
    name: entry.name,
    resolved: entry.version,
    archiveUrl: entry.dist.tarball,
    integrity: entry.dist.integrity,
  })
})

const resolveGitHub = Effect.fn("PackageCatalog.resolveGitHub")(function* (
  client: HttpClient.HttpClient,
  apiUrl: string,
  specifier: string,
) {
  const match = /^github:([^/#]+)\/([^#]+?)(?:#(.+))?$/.exec(specifier)
  if (match === null) return yield* catalogError(specifier, "Git packages must use github:owner/repository#ref")
  const owner = match[1]!
  const repository = match[2]!
  const reference = match[3] ?? "HEAD"
  const root = apiUrl.replace(/\/$/, "")
  const commitUrl = `${root}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/commits/${encodeURIComponent(reference)}`
  const commitText = yield* fetchBytes(client, commitUrl, "application/vnd.github+json").pipe(
    Effect.flatMap((bytes) => decodeText(specifier, bytes)),
  )
  const commit = yield* Schema.decodeEffect(commitCodec)(commitText).pipe(
    Effect.mapError((cause) => catalogError(specifier, "Invalid GitHub commit response", cause)),
  )
  if (!/^[0-9a-f]{40}$/.test(commit.sha)) return yield* catalogError(specifier, "GitHub returned an invalid commit SHA")
  const archiveUrl = `${root}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/tarball/${commit.sha}`
  const archive = yield* fetchBytes(client, archiveUrl, "application/vnd.github+json")
  const hash = yield* digest("SHA-256", archive)
  return {
    entry: LockEntry.make({
      specifier,
      source: "github",
      name: `${owner}/${repository}`,
      resolved: commit.sha,
      archiveUrl,
      integrity: `sha256-${Encoding.encodeBase64(hash)}`,
    }),
    archive,
  }
})

const cacheKey = (integrity: string): string => integrity.replace(/[^0-9A-Za-z_-]/g, "_")

const cachePackage = Effect.fn("PackageCatalog.cachePackage")(function* (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  client: HttpClient.HttpClient,
  cacheDir: string,
  entry: LockEntry,
  prefetched?: Uint8Array,
) {
  const key = cacheKey(entry.integrity)
  const archivePath = path.join(cacheDir, `${key}.tgz`)
  const packageDir = path.join(cacheDir, key)
  yield* fs
    .makeDirectory(cacheDir, { recursive: true })
    .pipe(Effect.mapError((error) => platformError(cacheDir, error)))
  const archiveExists = yield* fs
    .exists(archivePath)
    .pipe(Effect.mapError((error) => platformError(archivePath, error)))
  const archive =
    prefetched ??
    (archiveExists
      ? yield* fs.readFile(archivePath).pipe(Effect.mapError((error) => platformError(archivePath, error)))
      : yield* fetchBytes(client, entry.archiveUrl, "application/octet-stream"))
  yield* verifyIntegrity(entry.specifier, entry.integrity, archive)
  if (!(yield* fs.exists(archivePath).pipe(Effect.mapError((error) => platformError(archivePath, error))))) {
    yield* fs.writeFile(archivePath, archive).pipe(Effect.mapError((error) => platformError(archivePath, error)))
  }
  if (!(yield* fs.exists(packageDir).pipe(Effect.mapError((error) => platformError(packageDir, error))))) {
    const temporary = yield* Effect.acquireRelease(
      fs
        .makeTempDirectory({ directory: cacheDir, prefix: "extract-" })
        .pipe(Effect.mapError((error) => platformError(cacheDir, error))),
      (directory) =>
        fs.exists(directory).pipe(
          Effect.flatMap((exists) => (exists ? fs.remove(directory, { recursive: true }) : Effect.void)),
          Effect.ignore,
        ),
    )
    yield* extractArchive(fs, path, entry.specifier, temporary, archive)
    yield* fs.rename(temporary, packageDir).pipe(Effect.mapError((error) => platformError(packageDir, error)))
  }
  return packageDir
})

const globExpression = (pattern: string): RegExp => {
  let expression = "^"
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]!
    if (character === "*" && pattern[index + 1] === "*") {
      expression += ".*"
      index += 1
    } else if (character === "*") expression += "[^/]*"
    else expression += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&")
  }
  return new RegExp(`${expression}$`)
}

const validateManifestPath = (source: string, value: string): Effect.Effect<string, PackageCatalogError> =>
  value.length > 0 && !value.startsWith("/") && !value.includes("\\") && value.split("/").every((part) => part !== "..")
    ? Effect.succeed(value)
    : Effect.fail(catalogError(source, "Package manifest contains an unsafe path"))

const matchFiles = Effect.fn("PackageCatalog.matchFiles")(function* (
  fs: FileSystem.FileSystem,
  root: string,
  source: string,
  patterns: ReadonlyArray<string>,
) {
  const entries = yield* fs
    .readDirectory(root, { recursive: true })
    .pipe(Effect.mapError((error) => platformError(source, error)))
  const matched = new Set<string>()
  for (const pattern of patterns) {
    yield* validateManifestPath(source, pattern)
    const expression = globExpression(pattern)
    for (const entry of entries) if (expression.test(entry.replace(/\\/g, "/"))) matched.add(entry)
  }
  return [...matched].toSorted()
})

const loadPackage = Effect.fn("PackageCatalog.loadPackage")(function* (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  directory: string,
  entry: LockEntry,
  allowTools: boolean,
) {
  const manifestPath = path.join(directory, "package.json")
  const manifestText = yield* fs
    .readFileString(manifestPath)
    .pipe(Effect.mapError((error) => platformError(entry.specifier, error)))
  const manifest = yield* Schema.decodeEffect(manifestCodec)(manifestText).pipe(
    Effect.mapError((cause) => catalogError(entry.specifier, "Invalid package.json generalist field", cause)),
  )
  if (entry.source === "npm" && (manifest.name !== entry.name || manifest.version !== entry.resolved)) {
    return yield* PackageIntegrityMismatch.make({
      specifier: entry.specifier,
      expected: `${entry.name}@${entry.resolved}`,
      actual: `${manifest.name}@${manifest.version}`,
    })
  }
  const instructionFiles = yield* matchFiles(fs, directory, entry.specifier, manifest.generalist.instructions ?? [])
  const instructions: Array<Provider> = []
  for (const file of instructionFiles) {
    const text = yield* fs
      .readFileString(path.join(directory, file))
      .pipe(Effect.mapError((error) => platformError(entry.specifier, error)))
    instructions.push({ id: `${manifest.name}:${file}`, render: () => Effect.succeedSome(text) })
  }
  const skillFiles = yield* matchFiles(fs, directory, entry.specifier, manifest.generalist.skills ?? [])
  const skills: Array<Skill> = []
  for (const file of skillFiles) {
    const source = path.join(directory, file)
    const content = yield* fs
      .readFileString(source)
      .pipe(Effect.mapError((error) => platformError(entry.specifier, error)))
    const parsed = yield* parseDocument(source, content, path.basename(path.dirname(file))).pipe(
      Effect.mapError((error) => catalogError(entry.specifier, error.message, error)),
    )
    skills.push({
      ...parsed.frontmatter,
      instructions: Effect.succeed(parsed.body),
      tools: [],
      location: path.dirname(source),
    })
  }
  let toolkit: Toolkit.Toolkit<Record<string, PackageTool>> = Toolkit.empty
  let handlers: Layer.Layer<Tool.Handler<string>> | undefined
  if (manifest.generalist.tools !== undefined && allowTools) {
    const modulePath = yield* validateManifestPath(entry.specifier, manifest.generalist.tools)
    const loaded: unknown = yield* Effect.tryPromise({
      try: () => import(path.join(directory, modulePath)),
      catch: (cause) => catalogError(entry.specifier, "Unable to load package tools", cause),
    })
    const module = yield* Schema.decodeUnknownEffect(
      Schema.Struct({ toolkit: PackageToolkit, handlerLayer: PackageHandlerLayer }),
    )(loaded).pipe(
      Effect.mapError((cause) =>
        catalogError(entry.specifier, "Package tools module must export toolkit and handlerLayer", cause),
      ),
    )
    toolkit = module.toolkit
    handlers = module.handlerLayer
  }
  return { instructions, skills, toolkit, handlers, manifest }
})

const make = Effect.fn("PackageCatalog.make")(function* (options: Options) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const client = yield* HttpClient.HttpClient
  const cacheDir = path.resolve(options.cacheDir)
  const lockPath = path.resolve(options.lock)
  const lockExists = yield* fs.exists(lockPath).pipe(Effect.mapError((error) => platformError(lockPath, error)))
  const prefetched = new Map<string, Uint8Array>()
  let writeLock = false
  let entries: ReadonlyArray<LockEntry>
  if (lockExists) {
    const text = yield* fs.readFileString(lockPath).pipe(Effect.mapError((error) => platformError(lockPath, error)))
    const decoded = yield* Schema.decodeEffect(lockCodec)(text).pipe(
      Effect.mapError((cause) => catalogError(lockPath, "Invalid package lock file", cause)),
    )
    const expected = options.packages.join("\n")
    const actual = decoded.packages.map((entry) => entry.specifier).join("\n")
    if (actual !== expected) return yield* PackageIntegrityMismatch.make({ specifier: lockPath, expected, actual })
    entries = decoded.packages
  } else {
    const resolved: Array<LockEntry> = []
    for (const specifier of options.packages) {
      const npm = parseNpmSpec(specifier)
      if (npm !== undefined) {
        resolved.push(yield* resolveNpm(client, options.npmRegistryUrl ?? "https://registry.npmjs.org", specifier, npm))
      } else {
        const github = yield* resolveGitHub(client, options.githubApiUrl ?? "https://api.github.com", specifier)
        resolved.push(github.entry)
        prefetched.set(specifier, github.archive)
      }
    }
    entries = resolved
    writeLock = true
  }
  const instructions: Array<Provider> = []
  const skills: Array<Skill> = []
  const tools: Array<PackageTool> = []
  const handlerLayers: Array<Layer.Layer<Tool.Handler<string>>> = []
  for (const entry of entries) {
    const directory = yield* cachePackage(fs, path, client, cacheDir, entry, prefetched.get(entry.specifier))
    const loaded = yield* loadPackage(fs, path, directory, entry, options.allowTools === true)
    instructions.push(...loaded.instructions)
    skills.push(...loaded.skills)
    tools.push(...Object.values(loaded.toolkit.tools))
    if (loaded.handlers !== undefined) handlerLayers.push(loaded.handlers)
  }
  const byName = new Map(skills.map((skill) => [skill.name, skill]))
  const toolkit = Toolkit.make(...tools)
  const [firstHandler, ...remainingHandlers] = handlerLayers
  const executor: Layer.Layer<ToolExecutor, never, Tool.Handler<string>> = toolExecutorLayerToolkit(toolkit)
  const executorLayer =
    firstHandler === undefined
      ? toolExecutorLayerToolkit(Toolkit.empty)
      : executor.pipe(Layer.provide(remainingHandlers.reduce((left, right) => Layer.merge(left, right), firstHandler)))
  if (writeLock) {
    yield* fs.makeDirectory(path.dirname(lockPath), { recursive: true }).pipe(
      Effect.flatMap(() => Schema.encodeEffect(lockCodec)({ version: 1, packages: entries })),
      Effect.flatMap((text) => fs.writeFileString(lockPath, text)),
      Effect.mapError((cause) => catalogError(lockPath, "Unable to write package lock file", cause)),
    )
  }
  return PackageCatalog.of({
    instructions,
    skills: {
      all: Effect.succeed([...byName.values()]),
      get: (name) => Effect.succeed(byName.get(name)),
    },
    toolkit,
    executorLayer,
  })
})

/** @experimental Resolve packages and hold their catalog for the Layer scope. */
export const layer = (
  options: Options,
): Layer.Layer<
  PackageCatalog,
  PackageCatalogError | PackageIntegrityMismatch,
  FileSystem.FileSystem | Path.Path | HttpClient.HttpClient | Crypto.Crypto
> => Layer.effect(PackageCatalog, make(options))
