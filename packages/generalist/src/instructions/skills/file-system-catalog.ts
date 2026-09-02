import { Effect, FileSystem, Layer, Path, PlatformError, Stream } from "effect"
import { type Skill, SkillCatalog, SkillCatalogError } from "../../core/context/skill-catalog.js"
import { parseDocument, parseFrontmatter, splitDocument } from "./document.js"

/** Filesystem skill catalog options. */
export interface Options {
  readonly cwd: string
  readonly roots?: ReadonlyArray<string>
  readonly frontmatterMaxBytes?: number
}

const DEFAULT_ROOTS = [".agents/skills", ".claude/skills", ".pi/skills"] as const

const decoder = new TextDecoder()

interface SkillCatalogErrorInput {
  source: string
  message: string
  cause?: unknown
}

const sourceError = (source: string, message: string, cause?: unknown): SkillCatalogError => {
  const input: SkillCatalogErrorInput = { source, message }
  if (cause !== undefined) input.cause = cause
  return SkillCatalogError.make(input)
}

const mapPlatformError = (source: string, error: PlatformError.PlatformError): SkillCatalogError =>
  sourceError(source, error.message, error)

const readHeader = (
  fs: FileSystem.FileSystem,
  source: string,
  bytes: number,
): Effect.Effect<string, SkillCatalogError> =>
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
  frontmatterMaxBytes: number,
): Effect.Effect<Skill, SkillCatalogError> =>
  Effect.gen(function* () {
    const header = yield* readHeader(fs, file, frontmatterMaxBytes)
    const [headerBlock] = yield* splitDocument(file, header)
    const directoryName = path.basename(path.dirname(relativeFile))
    const frontmatter = yield* parseFrontmatter(file, headerBlock, directoryName)
    return {
      ...frontmatter,
      location: path.dirname(file),
      instructions: fs.readFileString(file).pipe(
        Effect.mapError((error) => mapPlatformError(file, error)),
        Effect.flatMap((content) =>
          parseDocument(file, content, directoryName).pipe(Effect.map((document) => document.body)),
        ),
      ),
      tools: [],
    }
  })

const discoverRoot = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string,
  root: string,
  frontmatterMaxBytes: number,
): Effect.Effect<ReadonlyArray<Skill>, SkillCatalogError> =>
  Effect.gen(function* () {
    const rootPath = path.isAbsolute(root) ? path.normalize(root) : path.join(cwd, root)
    const exists = yield* fs.exists(rootPath).pipe(Effect.mapError((error) => mapPlatformError(rootPath, error)))
    if (!exists) return []
    const entries = yield* fs
      .readDirectory(rootPath, { recursive: true })
      .pipe(Effect.mapError((error) => mapPlatformError(rootPath, error)))
    const skills: Array<Skill> = []
    for (const skillFile of entries.filter((entry) => path.basename(entry) === "SKILL.md").toSorted()) {
      skills.push(yield* loadSkill(fs, path, path.join(rootPath, skillFile), skillFile, frontmatterMaxBytes))
    }
    return skills
  })

/** Build a composable SkillCatalog from filesystem roots. */
export const make = (options: Options) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const cwd = path.resolve(options.cwd)
    const roots = options.roots ?? DEFAULT_ROOTS
    const frontmatterMaxBytes = options.frontmatterMaxBytes ?? 64 * 1024
    const byName = new Map<string, Skill>()
    for (const root of roots) {
      for (const skill of yield* discoverRoot(fs, path, cwd, root, frontmatterMaxBytes)) {
        byName.set(skill.name, skill)
      }
    }
    const skills = [...byName.values()]
    return {
      all: Effect.succeed(skills),
      get: (name: string) => Effect.succeed(byName.get(name)),
    }
  })

/** Build a SkillCatalog layer from filesystem roots. */
export const layer = (
  options: Options,
): Layer.Layer<SkillCatalog, SkillCatalogError, FileSystem.FileSystem | Path.Path> =>
  Layer.effect(SkillCatalog, make(options).pipe(Effect.map(SkillCatalog.of)))
