import { Effect, Function } from "effect"
import { SkillSource } from "@batonfx/core"

export interface ParsedDocument {
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
  SkillSource.SkillSourceError.make({ source, message, ...(cause === undefined ? {} : { cause }) })

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
      if (typeof value === "string") target.allowedTools = value.split(/\s+/).filter((item) => item.length > 0)
      else if (Array.isArray(value)) target.allowedTools = value
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

export const splitDocument: {
  (content: string): (source: string) => Effect.Effect<readonly [string, string], SkillSource.SkillSourceError>
  (source: string, content: string): Effect.Effect<readonly [string, string], SkillSource.SkillSourceError>
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
  (name: string): (source: string) => Effect.Effect<string, SkillSource.SkillSourceError>
  (source: string, name: string): Effect.Effect<string, SkillSource.SkillSourceError>
} = Function.dual(2, (source: string, name: string) =>
  /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(name) && !name.includes("--")
    ? Effect.succeed(name)
    : Effect.fail(
        sourceError(source, "SKILL.md name must be 1-64 lowercase alphanumeric or single-hyphen-separated characters"),
      ),
)

export const parseFrontmatter: {
  (
    block: string,
    directoryName: string,
  ): (source: string) => Effect.Effect<SkillSource.Frontmatter, SkillSource.SkillSourceError>
  (
    source: string,
    block: string,
    directoryName: string,
  ): Effect.Effect<SkillSource.Frontmatter, SkillSource.SkillSourceError>
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
    if (parsed.description === undefined || parsed.description.length === 0 || parsed.description.length > 1_024) {
      return yield* sourceError(source, "SKILL.md description must contain 1-1024 characters")
    }
    return {
      name: parsed.name,
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
  }),
)

export const parseDocument: {
  (
    content: string,
    directoryName: string,
  ): (source: string) => Effect.Effect<ParsedDocument, SkillSource.SkillSourceError>
  (source: string, content: string, directoryName: string): Effect.Effect<ParsedDocument, SkillSource.SkillSourceError>
} = Function.dual(3, (source: string, content: string, directoryName: string) =>
  Effect.gen(function* () {
    const [header, body] = yield* splitDocument(source, content)
    return { frontmatter: yield* parseFrontmatter(source, header, directoryName), body }
  }),
)
