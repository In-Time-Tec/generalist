import { Crypto, Effect, Encoding, Function, Schema, Stream } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse, Url } from "effect/unstable/http"
import { SkillSource } from "tenetkit"
import { parseDocument, validateName } from "./skill-document.js"

const ManifestSkill = Schema.Struct({
  ...SkillSource.Frontmatter.fields,
  skillPath: Schema.String,
  sha256: Schema.String,
})

type ManifestSkill = typeof ManifestSkill.Type

const Manifest = Schema.Struct({
  version: Schema.Literal(1),
  skills: Schema.Array(ManifestSkill),
})

/** @experimental Shared hosted-catalog limits and trusted tools. */
export interface Limits {
  readonly manifestMaxBytes?: number
  readonly bodyMaxBytes?: number
  readonly maxSkills?: number
  readonly descriptionCap?: number
  readonly toolsBySkill?: Readonly<Record<string, ReadonlyArray<SkillSource.Skill["tools"][number]>>>
}

interface MakeOptions {
  readonly limits: Limits
  readonly source: string
  readonly manifestUrl: string
  readonly resolveSkillUrl: (skillPath: string) => Effect.Effect<string, SkillSource.SkillSourceError>
  readonly manifestHeaders?: Readonly<Record<string, string>>
  readonly bodyHeaders?: Readonly<Record<string, string>>
}

const decoder = new TextDecoder("utf-8", { fatal: true })

const sourceError = (source: string, message: string, cause?: unknown): SkillSource.SkillSourceError =>
  SkillSource.SkillSourceError.make({ source, message, ...(cause === undefined ? {} : { cause }) })

const safeInteger = (
  source: string,
  name: string,
  value: number,
  minimum: number,
): Effect.Effect<number, SkillSource.SkillSourceError> =>
  Number.isSafeInteger(value) && value >= minimum
    ? Effect.succeed(value)
    : Effect.fail(sourceError(source, `${name} must be a safe integer >= ${minimum}`))

const request = (url: string, headers: Readonly<Record<string, string>> | undefined) => {
  let value = HttpClientRequest.get(url)
  for (const [name, header] of Object.entries(headers ?? {})) value = HttpClientRequest.setHeader(value, name, header)
  return value
}

const fetchBytes = (
  client: HttpClient.HttpClient,
  source: string,
  url: string,
  headers: Readonly<Record<string, string>> | undefined,
  maxBytes: number,
): Effect.Effect<Uint8Array, SkillSource.SkillSourceError> =>
  client.execute(request(url, headers)).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.mapError(() => sourceError(source, "Hosted skill request failed")),
    Effect.flatMap((response) =>
      response.stream.pipe(
        Stream.mapError(() => sourceError(source, "Hosted skill request failed")),
        Stream.runFoldEffect(
          () => ({ size: 0, chunks: [] as Array<Uint8Array> }),
          (state, chunk) => {
            const size = state.size + chunk.byteLength
            if (size > maxBytes) {
              return Effect.fail(sourceError(source, `Hosted skill response exceeds ${maxBytes} bytes`))
            }
            state.chunks.push(chunk)
            return Effect.succeed({ size, chunks: state.chunks })
          },
        ),
        Effect.map(({ chunks, size }) => {
          const bytes = new Uint8Array(size)
          let offset = 0
          for (const chunk of chunks) {
            bytes.set(chunk, offset)
            offset += chunk.byteLength
          }
          return bytes
        }),
      ),
    ),
  )

const decodeText = (source: string, bytes: Uint8Array): Effect.Effect<string, SkillSource.SkillSourceError> =>
  Effect.try({
    try: () => decoder.decode(bytes),
    catch: (cause) => sourceError(source, "Hosted skill response is not valid UTF-8", cause),
  })

const sameFrontmatter = (left: SkillSource.Frontmatter, right: SkillSource.Frontmatter): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

/** @experimental Validate one safe relative SKILL.md path. */
export const validateSkillPath: {
  (skillPath: string): (source: string) => Effect.Effect<string, SkillSource.SkillSourceError>
  (source: string, skillPath: string): Effect.Effect<string, SkillSource.SkillSourceError>
} = Function.dual(2, (source: string, skillPath: string) => {
  const segments = skillPath.split("/")
  return skillPath.length > 0 &&
    !skillPath.startsWith("/") &&
    !skillPath.includes("\\") &&
    !skillPath.includes("%") &&
    !skillPath.includes("?") &&
    !skillPath.includes("#") &&
    segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
    ? Effect.succeed(skillPath)
    : Effect.fail(sourceError(source, "Unsafe hosted skill path"))
})

/** @experimental Resolve a same-origin path beneath a manifest directory. */
export const resolveRelative: {
  (manifestUrl: string, skillPath: string): (source: string) => Effect.Effect<string, SkillSource.SkillSourceError>
  (source: string, manifestUrl: string, skillPath: string): Effect.Effect<string, SkillSource.SkillSourceError>
} = Function.dual(3, (source: string, manifestUrl: string, skillPath: string) =>
  Effect.gen(function* () {
    yield* validateSkillPath(source, skillPath)
    const manifest = yield* Effect.fromResult(Url.fromString(manifestUrl)).pipe(
      Effect.mapError(() => sourceError(source, "Invalid manifest URL")),
    )
    const directory = yield* Effect.fromResult(Url.fromString(".", manifest)).pipe(
      Effect.mapError(() => sourceError(source, "Invalid manifest directory URL")),
    )
    const resolved = yield* Effect.fromResult(Url.fromString(skillPath, directory)).pipe(
      Effect.mapError(() => sourceError(source, "Invalid hosted skill URL")),
    )
    if (resolved.origin !== manifest.origin || !resolved.pathname.startsWith(directory.pathname)) {
      return yield* sourceError(source, "Hosted skill path escapes manifest directory")
    }
    return resolved.toString()
  }),
)

/** @experimental Build a hosted manifest source over Effect HTTP and Crypto services. */
export const make = (options: MakeOptions): SkillSource.Source<HttpClient.HttpClient | Crypto.Crypto> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const crypto = yield* Crypto.Crypto
    const manifestMaxBytes = yield* safeInteger(
      options.source,
      "manifestMaxBytes",
      options.limits.manifestMaxBytes ?? 1024 * 1024,
      1,
    )
    const bodyMaxBytes = yield* safeInteger(
      options.source,
      "bodyMaxBytes",
      options.limits.bodyMaxBytes ?? 1024 * 1024,
      1,
    )
    const maxSkills = yield* safeInteger(options.source, "maxSkills", options.limits.maxSkills ?? 1_000, 1)
    const descriptionCap = yield* safeInteger(
      options.source,
      "descriptionCap",
      options.limits.descriptionCap ?? SkillSource.DESCRIPTION_CAP,
      0,
    )
    const manifestBytes = yield* fetchBytes(
      client,
      options.source,
      options.manifestUrl,
      options.manifestHeaders,
      manifestMaxBytes,
    )
    const manifestText = yield* decodeText(options.source, manifestBytes)
    const manifest = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Manifest))(manifestText).pipe(
      Effect.mapError((error) => sourceError(options.source, "Invalid hosted skill manifest", error)),
    )
    if (manifest.skills.length > maxSkills) {
      return yield* sourceError(options.source, `Hosted skill manifest exceeds ${maxSkills} skills`)
    }
    const byName = new Map<string, SkillSource.Skill>()
    for (const entry of manifest.skills) {
      yield* validateName(options.source, entry.name)
      if (!/^[0-9a-f]{64}$/.test(entry.sha256)) {
        return yield* sourceError(options.source, `Invalid SHA-256 for hosted skill ${entry.name}`)
      }
      if (byName.has(entry.name)) {
        return yield* sourceError(options.source, `Duplicate hosted skill name: ${entry.name}`)
      }
      const pathSegments = entry.skillPath.split("/")
      if (pathSegments.at(-1) !== "SKILL.md" || pathSegments.at(-2) !== entry.name) {
        return yield* sourceError(options.source, `Hosted skill path directory must match skill name: ${entry.name}`)
      }
      const skillUrl = yield* options.resolveSkillUrl(entry.skillPath)
      const { sha256: _, skillPath: __, ...metadata } = entry
      const body = fetchBytes(client, options.source, skillUrl, options.bodyHeaders, bodyMaxBytes).pipe(
        Effect.flatMap((bytes) =>
          crypto.digest("SHA-256", bytes).pipe(
            Effect.mapError((error) => sourceError(options.source, `Unable to hash hosted skill ${entry.name}`, error)),
            Effect.flatMap((actual) =>
              Encoding.encodeHex(actual) === entry.sha256
                ? decodeText(options.source, bytes)
                : Effect.fail(sourceError(options.source, `SHA-256 mismatch for hosted skill ${entry.name}`)),
            ),
          ),
        ),
        Effect.flatMap((content) =>
          parseDocument(options.source, content, entry.name).pipe(
            Effect.flatMap((document) =>
              sameFrontmatter(document.frontmatter, metadata)
                ? Effect.succeed(document.body)
                : Effect.fail(sourceError(options.source, `Frontmatter mismatch for hosted skill ${entry.name}`)),
            ),
          ),
        ),
      )
      const tools =
        options.limits.toolsBySkill !== undefined && Object.hasOwn(options.limits.toolsBySkill, entry.name)
          ? (options.limits.toolsBySkill[entry.name] ?? [])
          : []
      byName.set(entry.name, {
        frontmatter: metadata,
        listing: SkillSource.makeListing(metadata, descriptionCap),
        body,
        tools,
      })
    }
    const skills = [...byName.values()]
    return {
      all: Effect.succeed(skills),
      get: (name) => Effect.succeed(byName.get(name)),
    }
  })
