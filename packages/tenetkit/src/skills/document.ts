import { Effect, Function, Schema } from "effect"
import { SkillCatalog } from "../core/index.js"
import { Frontmatter } from "../core/context/skill-catalog.js"

export interface ParsedDocument {
  readonly frontmatter: Frontmatter
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

interface SourceErrorFields {
  source: string
  message: string
  cause?: unknown
}

const sourceError = (source: string, message: string, cause?: unknown): SkillCatalog.SkillCatalogError => {
  const fields: SourceErrorFields = { source, message }
  if (cause !== undefined) fields.cause = cause
  return SkillCatalog.SkillCatalogError.make(fields)
}

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

const setStringValue = (target: Partial<ParsedHeader>, key: string, value: string) => {
  switch (normalizeKey(key)) {
    case "name":
      target.name = value
      break
    case "description":
      target.description = value
      break
    case "whentouse":
      target.whenToUse = value
      break
    case "allowedtools":
      target.allowedTools = value.split(/\s+/).filter((item) => item.length > 0)
      break
    case "agent":
      target.agent = value
      break
    case "model":
      target.model = value
      break
  }
}

const setBooleanValue = (target: Partial<ParsedHeader>, key: string, value: boolean) => {
  switch (normalizeKey(key)) {
    case "disablemodelinvocation":
      target.disableModelInvocation = value
      break
    case "userinvocable":
      target.userInvocable = value
      break
    case "contextfork":
      target.contextFork = value
      break
  }
}

const setArrayValue = (target: Partial<ParsedHeader>, key: string, value: ReadonlyArray<string>) => {
  switch (normalizeKey(key)) {
    case "allowedtools":
      target.allowedTools = value
      break
    case "paths":
      target.paths = value
      break
  }
}

const parseHeader = (source: string, block: string): Effect.Effect<ParsedHeader, SkillCatalog.SkillCatalogError> =>
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
        setArrayValue(parsed, key, values)
      } else if (raw.startsWith("[") && raw.endsWith("]")) {
        setArrayValue(parsed, key, parseInlineArray(raw))
      } else {
        const boolean = parseBoolean(raw)
        if (boolean === undefined) setStringValue(parsed, key, stripQuotes(raw))
        else setBooleanValue(parsed, key, boolean)
      }
    }
    return parsed
  }).pipe(Effect.catchCause((cause) => Effect.fail(sourceError(source, "Invalid SKILL.md frontmatter", cause))))

export const splitDocument: {
  (content: string): (source: string) => Effect.Effect<readonly [string, string], SkillCatalog.SkillCatalogError>
  (source: string, content: string): Effect.Effect<readonly [string, string], SkillCatalog.SkillCatalogError>
} = Function.dual(2, (source: string, content: string) =>
  Effect.gen(function* () {
    const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n")
    const lines = normalized.split("\n")
    if (lines[0] !== "---") {
      return yield* sourceError(source, "Invalid SKILL.md document: missing opening frontmatter fence")
    }
    const close = lines.findIndex((line, index) => index > 0 && line === "---")
    if (close === -1) {
      return yield* sourceError(source, "Invalid SKILL.md document: missing closing frontmatter fence")
    }
    return [lines.slice(1, close).join("\n"), lines.slice(close + 1).join("\n")] as const
  }),
)

export const validateName: {
  (name: string): (source: string) => Effect.Effect<string, SkillCatalog.SkillCatalogError>
  (source: string, name: string): Effect.Effect<string, SkillCatalog.SkillCatalogError>
} = Function.dual(2, (source: string, name: string) =>
  /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(name) && !name.includes("--")
    ? Effect.succeed(name)
    : Effect.fail(
        sourceError(source, "SKILL.md name must be 1-64 lowercase alphanumeric or single-hyphen-separated characters"),
      ),
)

export const parseFrontmatter: {
  (block: string, directoryName: string): (source: string) => Effect.Effect<Frontmatter, SkillCatalog.SkillCatalogError>
  (source: string, block: string, directoryName: string): Effect.Effect<Frontmatter, SkillCatalog.SkillCatalogError>
} = Function.dual(3, (source: string, block: string, directoryName: string) =>
  Effect.gen(function* () {
    const parsed = yield* parseHeader(source, block)
    if (parsed.name === undefined) {
      return yield* sourceError(source, "SKILL.md frontmatter requires name")
    }
    yield* validateName(source, parsed.name)
    if (parsed.name !== directoryName) {
      return yield* sourceError(source, `SKILL.md name must match directory ${directoryName}`)
    }
    return yield* Schema.decodeUnknownEffect(Frontmatter)(parsed).pipe(
      Effect.mapError((cause) =>
        sourceError(source, `SKILL.md description must contain 1-${SkillCatalog.DESCRIPTION_CAP} characters`, cause),
      ),
    )
  }),
)

export const parseDocument: {
  (
    content: string,
    directoryName: string,
  ): (source: string) => Effect.Effect<ParsedDocument, SkillCatalog.SkillCatalogError>
  (
    source: string,
    content: string,
    directoryName: string,
  ): Effect.Effect<ParsedDocument, SkillCatalog.SkillCatalogError>
} = Function.dual(3, (source: string, content: string, directoryName: string) =>
  Effect.gen(function* () {
    const [header, body] = yield* splitDocument(source, content)
    return { frontmatter: yield* parseFrontmatter(source, header, directoryName), body }
  }),
)
