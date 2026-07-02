import { Effect, FileSystem, Layer, Path, PlatformError, Stream } from "effect"
import { SkillSource } from "@batonfx/core"

/** @experimental Filesystem skill-loader options. */
export interface LoadOptions {
  readonly roots?: ReadonlyArray<string>
  readonly cwd?: string
  readonly descriptionCap?: number
  readonly frontmatterMaxBytes?: number
}

const DEFAULT_ROOTS = [".agents/skills", ".claude/skills", ".pi/skills"] as const

const decoder = new TextDecoder()

interface ParsedDocument {
  readonly frontmatter: SkillSource.Frontmatter
  readonly body: string
}

interface ParsedHeader {
  name?: string
  description?: string
  whenToUse?: string
  allowedTools?: ReadonlyArray<string>
  disableModelInvocation?: boolean
  userInvocable?: boolean
  contextFork?: boolean
  agent?: string
  model?: string
  paths?: ReadonlyArray<string>
}

const sourceError = (source: string, message: string, cause?: unknown): SkillSource.SkillSourceError =>
  new SkillSource.SkillSourceError({ source, message, ...(cause === undefined ? {} : { cause }) })

const mapPlatformError = (source: string, error: PlatformError.PlatformError): SkillSource.SkillSourceError =>
  sourceError(source, error.message, error)

const normalizeKey = (key: string): string => key.replace(/[-_]/g, "").toLowerCase()

const stripQuotes = (value: string): string => {
  const trimmed = value.trim()
  return (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ? trimmed.slice(1, -1)
    : trimmed
}

const parseInlineArray = (value: string): ReadonlyArray<string> => {
  const trimmed = value.trim()
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return []
  const inner = trimmed.slice(1, -1).trim()
  return inner.length === 0 ? [] : inner.split(",").map((item) => stripQuotes(item).trim())
}

const parseBoolean = (value: string): boolean | undefined => {
  const lowered = value.trim().toLowerCase()
  if (lowered === "true") return true
  if (lowered === "false") return false
  return undefined
}

const setValue = (target: Partial<ParsedHeader>, key: string, value: string | boolean | ReadonlyArray<string>) => {
  switch (normalizeKey(key)) {
    case "name":
      if (typeof value === "string") target.name = value
      break
    case "description":
      if (typeof value === "string") target.description = value
      break
    case "whentouse":
      if (typeof value === "string") target.whenToUse = value
      break
    case "allowedtools":
      if (Array.isArray(value)) target.allowedTools = value
      break
    case "disablemodelinvocation":
      if (typeof value === "boolean") target.disableModelInvocation = value
      break
    case "userinvocable":
      if (typeof value === "boolean") target.userInvocable = value
      break
    case "contextfork":
      if (typeof value === "boolean") target.contextFork = value
      break
    case "agent":
      if (typeof value === "string") target.agent = value
      break
    case "model":
      if (typeof value === "string") target.model = value
      break
    case "paths":
      if (Array.isArray(value)) target.paths = value
      break
  }
}

const parseHeader = (source: string, block: string): Effect.Effect<ParsedHeader, SkillSource.SkillSourceError> =>
  Effect.sync(() => {
    const parsed: Partial<ParsedHeader> = {}
    const lines = block.split("\n")
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]?.trimEnd() ?? ""
      if (line.trim().length === 0) continue
      const separator = line.indexOf(":")
      if (separator === -1) continue
      const key = line.slice(0, separator).trim()
      const raw = line.slice(separator + 1).trim()
      if (raw.length === 0) {
        const values: Array<string> = []
        while ((lines[index + 1]?.trimStart().startsWith("- ") ?? false) === true) {
          index += 1
          values.push(stripQuotes((lines[index] ?? "").trimStart().slice(2)))
        }
        setValue(parsed, key, values)
      } else if (raw.startsWith("[") && raw.endsWith("]")) {
        setValue(parsed, key, parseInlineArray(raw))
      } else {
        setValue(parsed, key, parseBoolean(raw) ?? stripQuotes(raw))
      }
    }
    return parsed
  }).pipe(Effect.catchCause((cause) => Effect.fail(sourceError(source, "Invalid SKILL.md frontmatter", cause))))

const splitDocument = (
  source: string,
  content: string,
): Effect.Effect<readonly [string, string], SkillSource.SkillSourceError> =>
  Effect.sync(() => {
    const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n")
    const lines = normalized.split("\n")
    if (lines[0] !== "---") throw new Error("missing opening frontmatter fence")
    const close = lines.findIndex((line, index) => index > 0 && line === "---")
    if (close === -1) throw new Error("missing closing frontmatter fence")
    return [lines.slice(1, close).join("\n"), lines.slice(close + 1).join("\n")] as const
  }).pipe(Effect.catchCause((cause) => Effect.fail(sourceError(source, "Invalid SKILL.md document", cause))))

const namespacedName = (path: Path.Path, relativeFile: string, explicitName: string | undefined): string => {
  const directory = path.dirname(relativeFile)
  const segments = directory === "." ? [] : directory.split("/").filter((part) => part.length > 0)
  const directoryName = segments.at(-1) ?? path.basename(path.dirname(relativeFile))
  const baseName = explicitName ?? directoryName
  const namespace = segments.slice(0, -1).join(":")
  return baseName.includes(":") || namespace.length === 0 ? baseName : `${namespace}:${baseName}`
}

const parseDocument = (
  source: string,
  content: string,
  name: string,
): Effect.Effect<ParsedDocument, SkillSource.SkillSourceError> =>
  Effect.gen(function* () {
    const [header, body] = yield* splitDocument(source, content)
    const parsed = yield* parseHeader(source, header)
    if (parsed.description === undefined || parsed.description.length === 0) {
      return yield* Effect.fail(sourceError(source, "SKILL.md frontmatter requires description"))
    }
    return {
      body,
      frontmatter: {
        name,
        description: parsed.description,
        ...(parsed.whenToUse === undefined ? {} : { whenToUse: parsed.whenToUse }),
        ...(parsed.allowedTools === undefined ? {} : { allowedTools: parsed.allowedTools }),
        ...(parsed.disableModelInvocation === undefined
          ? {}
          : { disableModelInvocation: parsed.disableModelInvocation }),
        ...(parsed.userInvocable === undefined ? {} : { userInvocable: parsed.userInvocable }),
        ...(parsed.contextFork === undefined ? {} : { contextFork: parsed.contextFork }),
        ...(parsed.agent === undefined ? {} : { agent: parsed.agent }),
        ...(parsed.model === undefined ? {} : { model: parsed.model }),
        ...(parsed.paths === undefined ? {} : { paths: parsed.paths }),
      },
    }
  })

const readHeader = (
  fs: FileSystem.FileSystem,
  source: string,
  bytes: number,
): Effect.Effect<string, SkillSource.SkillSourceError> =>
  fs.stream(source, { bytesToRead: bytes, chunkSize: bytes }).pipe(
    Stream.runFold(
      () => "",
      (content, chunk) => `${content}${decoder.decode(chunk)}`,
    ),
    Effect.mapError((error) => mapPlatformError(source, error)),
  )

const loadSkill = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  file: string,
  relativeFile: string,
  descriptionCap: number,
  frontmatterMaxBytes: number,
): Effect.Effect<SkillSource.Skill, SkillSource.SkillSourceError> =>
  Effect.gen(function* () {
    const header = yield* readHeader(fs, file, frontmatterMaxBytes)
    const [headerBlock] = yield* splitDocument(file, header)
    const parsed = yield* parseHeader(file, headerBlock)
    const name = namespacedName(path, relativeFile, parsed.name)
    if (parsed.description === undefined || parsed.description.length === 0) {
      return yield* Effect.fail(sourceError(file, "SKILL.md frontmatter requires description"))
    }
    const frontmatter: SkillSource.Frontmatter = {
      name,
      description: parsed.description,
      ...(parsed.whenToUse === undefined ? {} : { whenToUse: parsed.whenToUse }),
      ...(parsed.allowedTools === undefined ? {} : { allowedTools: parsed.allowedTools }),
      ...(parsed.disableModelInvocation === undefined ? {} : { disableModelInvocation: parsed.disableModelInvocation }),
      ...(parsed.userInvocable === undefined ? {} : { userInvocable: parsed.userInvocable }),
      ...(parsed.contextFork === undefined ? {} : { contextFork: parsed.contextFork }),
      ...(parsed.agent === undefined ? {} : { agent: parsed.agent }),
      ...(parsed.model === undefined ? {} : { model: parsed.model }),
      ...(parsed.paths === undefined ? {} : { paths: parsed.paths }),
    }
    return {
      frontmatter,
      listing: SkillSource.makeListing(frontmatter, descriptionCap),
      body: fs.readFileString(file).pipe(
        Effect.mapError((error) => mapPlatformError(file, error)),
        Effect.flatMap((content) => parseDocument(file, content, name).pipe(Effect.map((document) => document.body))),
      ),
      tools: [],
    }
  })

const discoverRoot = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string,
  root: string,
  descriptionCap: number,
  frontmatterMaxBytes: number,
): Effect.Effect<ReadonlyArray<SkillSource.Skill>, SkillSource.SkillSourceError> =>
  Effect.gen(function* () {
    const rootPath = path.isAbsolute(root) ? path.normalize(root) : path.join(cwd, root)
    const exists = yield* fs.exists(rootPath).pipe(Effect.mapError((error) => mapPlatformError(rootPath, error)))
    if (!exists) return []
    const entries = yield* fs
      .readDirectory(rootPath, { recursive: true })
      .pipe(Effect.mapError((error) => mapPlatformError(rootPath, error)))
    const skills: Array<SkillSource.Skill> = []
    for (const skillFile of entries.filter((entry) => path.basename(entry) === "SKILL.md").toSorted()) {
      skills.push(
        yield* loadSkill(fs, path, path.join(rootPath, skillFile), skillFile, descriptionCap, frontmatterMaxBytes),
      )
    }
    return skills
  })

/** @experimental Build a SkillSource from filesystem roots. */
export const layer = (
  options: LoadOptions = {},
): Layer.Layer<SkillSource.SkillSource, SkillSource.SkillSourceError, FileSystem.FileSystem | Path.Path> =>
  Layer.effect(
    SkillSource.SkillSource,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const cwd = options.cwd === undefined ? "." : path.resolve(options.cwd)
      const roots = options.roots ?? DEFAULT_ROOTS
      const descriptionCap = options.descriptionCap ?? SkillSource.DESCRIPTION_CAP
      const frontmatterMaxBytes = options.frontmatterMaxBytes ?? 64 * 1024
      const byName = new Map<string, SkillSource.Skill>()
      for (const root of roots) {
        for (const skill of yield* discoverRoot(fs, path, cwd, root, descriptionCap, frontmatterMaxBytes)) {
          byName.set(skill.frontmatter.name, skill)
        }
      }
      const skills = [...byName.values()]
      return SkillSource.SkillSource.of({
        all: Effect.succeed(skills),
        get: (name) => Effect.succeed(byName.get(name)),
      })
    }),
  )
