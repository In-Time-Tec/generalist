import { Effect, FileSystem, Layer, Path, PlatformError, Stream } from "effect"
import { SkillSource } from "@batonfx/core"
import { parseDocument, parseFrontmatter, splitDocument } from "./skill-document.js"

/** @experimental Filesystem skill-loader options. */
export interface LoadOptions {
  readonly roots?: ReadonlyArray<string>
  readonly cwd?: string
  readonly descriptionCap?: number
  readonly frontmatterMaxBytes?: number
}

const DEFAULT_ROOTS = [".agents/skills", ".claude/skills", ".pi/skills"] as const

const decoder = new TextDecoder()

const sourceError = (source: string, message: string, cause?: unknown): SkillSource.SkillSourceError =>
  new SkillSource.SkillSourceError({ source, message, ...(cause === undefined ? {} : { cause }) })

const mapPlatformError = (source: string, error: PlatformError.PlatformError): SkillSource.SkillSourceError =>
  sourceError(source, error.message, error)

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
    const directoryName = path.basename(path.dirname(relativeFile))
    const frontmatter = yield* parseFrontmatter(file, headerBlock, directoryName)
    return {
      frontmatter,
      listing: SkillSource.makeListing(frontmatter, descriptionCap),
      body: fs.readFileString(file).pipe(
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

/** @experimental Build a composable SkillSource from filesystem roots. */
export const make = (options: LoadOptions = {}): SkillSource.Source<FileSystem.FileSystem | Path.Path> =>
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
    return {
      all: Effect.succeed(skills),
      get: (name) => Effect.succeed(byName.get(name)),
    }
  })

/** @experimental Build a SkillSource layer from filesystem roots. */
export const layer = (
  options: LoadOptions = {},
): Layer.Layer<SkillSource.SkillSource, SkillSource.SkillSourceError, FileSystem.FileSystem | Path.Path> =>
  Layer.effect(SkillSource.SkillSource, make(options).pipe(Effect.map(SkillSource.SkillSource.of)))
