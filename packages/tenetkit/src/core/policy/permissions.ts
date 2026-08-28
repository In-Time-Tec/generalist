import { Context, Effect, Layer, Option, Ref, Schema } from "effect"
import { dual } from "effect/Function"
import type { AccessRequest } from "../tools/tool-authorization.js"

/** @experimental What a matched permission rule grants. */
export type Level = "allow" | "deny" | "ask"

/** @experimental One ordered permission rule. */
export interface Rule {
  readonly pattern: string
  readonly level: Level
  readonly reason?: string
}

/** @experimental Ordered permission ruleset. */
export interface Ruleset {
  readonly rules: ReadonlyArray<Rule>
  readonly fallback?: Level
}

/** @experimental */
export interface Allow {
  readonly _tag: "Allow"
}

/** @experimental */
export interface Deny {
  readonly _tag: "Deny"
  readonly reason?: string
}

/** @experimental */
export interface Ask {
  readonly _tag: "Ask"
  readonly token: string
}

/** @experimental Resolved policy decision for one tool call. */
export type Decision = Allow | Deny | Ask

/** @experimental Permission service failure. */
export class PermissionError extends Schema.TaggedError<PermissionError>()("tenetkit/core/PermissionError", {
  message: Schema.String,
}) {}

/** @experimental Permission policy service boundary. */
export interface Interface {
  readonly evaluate: (request: AccessRequest) => Effect.Effect<Decision, PermissionError>
}

/** @experimental */
export class Permissions extends Context.Service<Permissions, Interface>()("tenetkit/core/policy/permissions") {}

/** @experimental Remembered-rule store. */
export interface RuleStoreInterface {
  readonly remember: (rule: Rule) => Effect.Effect<void, PermissionError>
  readonly rules: Effect.Effect<ReadonlyArray<Rule>, PermissionError>
}

/** @experimental */
export class RuleStore extends Context.Service<RuleStore, RuleStoreInterface>()(
  "tenetkit/core/policy/permissions/RuleStore",
) {}

const escapeRegExp = (value: string): string => value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&")

const glob = (pattern: string): RegExp => new RegExp(`^${pattern.split("*").map(escapeRegExp).join(".*")}$`)

interface Projection {
  readonly candidates: ReadonlyArray<string>
  readonly complete: boolean
}

type PolicyParameters = typeof Schema.Unknown.Type

const unknownArray = Schema.Array(Schema.Unknown)
const unknownRecord = Schema.Record(Schema.String, Schema.Unknown)

const textLeaf = (value: PolicyParameters): Option.Option<string> => {
  if (Schema.is(Schema.String)(value)) return Option.some(value)
  if (Schema.is(Schema.Finite)(value)) return Option.some(String(value))
  if (Schema.is(Schema.Boolean)(value)) return Option.some(String(value))
  if (Schema.is(Schema.BigInt)(value)) return Option.some(String(value))
  return Option.none()
}

const collectCandidates = (value: PolicyParameters, visiting: Set<object>, out: Array<string>): boolean => {
  const leaf = textLeaf(value)
  if (Option.isSome(leaf)) {
    out.push(leaf.value)
    return true
  }
  if (value === null || value === undefined) return true
  const array = Schema.decodeUnknownOption(unknownArray)(value)
  if (Option.isSome(array)) {
    if (visiting.has(array.value)) return false
    visiting.add(array.value)
    const joined = array.value.flatMap((element) => Option.toArray(textLeaf(element)))
    if (joined.length > 0) out.push(joined.join(" "))
    let complete = true
    for (const element of array.value) {
      complete = collectCandidates(element, visiting, out) && complete
    }
    visiting.delete(array.value)
    return complete
  }
  const record = Schema.decodeUnknownOption(unknownRecord)(value)
  if (Option.isNone(record) || visiting.has(record.value)) return false
  visiting.add(record.value)
  let complete = true
  for (const propValue of Object.values(record.value)) {
    complete = collectCandidates(propValue, visiting, out) && complete
  }
  visiting.delete(record.value)
  return complete
}

const serializedParams = (params: PolicyParameters): string => {
  try {
    const json = JSON.stringify(params)
    return json === undefined ? String(params) : json
  } catch {
    return String(params)
  }
}

const project = (params: PolicyParameters): Projection => {
  const candidates: Array<string> = []
  const complete = collectCandidates(params, new Set(), candidates)
  candidates.push(serializedParams(params))
  return { candidates, complete }
}

const matchesProjection = (pattern: string, tool: string, projection: Projection, failClosed: boolean): boolean => {
  const separator = pattern.indexOf(":")
  if (separator === -1) return glob(pattern).test(tool)
  const toolPattern = pattern.slice(0, separator)
  if (!glob(toolPattern).test(tool)) return false
  if (!projection.complete && failClosed) return true
  const paramsPattern = glob(pattern.slice(separator + 1))
  return projection.candidates.some((candidate) => paramsPattern.test(candidate))
}

/** @experimental Match a permission pattern against a tool call. */
export const matches: {
  (tool: string, params: PolicyParameters): (pattern: string) => boolean
  (pattern: string, tool: string, params: PolicyParameters): boolean
} = dual(3, (pattern: string, tool: string, params: PolicyParameters): boolean =>
  matchesProjection(pattern, tool, project(params), false),
)

const matchingRule = (ruleset: Ruleset, tool: string, params: PolicyParameters): Rule | undefined => {
  const projection = project(params)
  let matched: Rule | undefined
  for (const rule of ruleset.rules) {
    if (matchesProjection(rule.pattern, tool, projection, rule.level === "deny")) matched = rule
  }
  return matched
}

/** @experimental Find the last matching rule without applying a fallback. */
export const matchRule: {
  (tool: string, params: PolicyParameters): (ruleset: Ruleset) => Option.Option<Rule>
  (ruleset: Ruleset, tool: string, params: PolicyParameters): Option.Option<Rule>
} = dual(
  3,
  (ruleset: Ruleset, tool: string, params: PolicyParameters): Option.Option<Rule> =>
    Option.fromNullishOr(matchingRule(ruleset, tool, params)),
)

/** @experimental Evaluate a ruleset with last-match semantics. */
export const evaluate: {
  (tool: string, params: PolicyParameters): (ruleset: Ruleset) => Level
  (ruleset: Ruleset, tool: string, params: PolicyParameters): Level
} = dual(
  3,
  (ruleset: Ruleset, tool: string, params: PolicyParameters): Level =>
    matchingRule(ruleset, tool, params)?.level ?? ruleset.fallback ?? "ask",
)

const tokenFor = (request: AccessRequest): string => `permission:${request.call.id}`

const decisionFor = (ruleset: Ruleset, request: AccessRequest): Decision => {
  const rule = matchingRule(ruleset, request.call.name, request.call.params)
  const level = rule?.level ?? ruleset.fallback ?? "ask"
  switch (level) {
    case "allow":
      return { _tag: "Allow" }
    case "deny":
      return rule?.reason === undefined ? { _tag: "Deny" } : { _tag: "Deny", reason: rule.reason }
    case "ask":
      return { _tag: "Ask", token: tokenFor(request) }
  }
}

/** @experimental Evaluate a base policy with remembered rules as a last-match overlay. */
export const evaluateWithRules: {
  (store: RuleStoreInterface, request: AccessRequest): (base: Interface) => Effect.Effect<Decision, PermissionError>
  (base: Interface, store: RuleStoreInterface, request: AccessRequest): Effect.Effect<Decision, PermissionError>
} = dual(
  3,
  (base: Interface, store: RuleStoreInterface, request: AccessRequest): Effect.Effect<Decision, PermissionError> =>
    Effect.gen(function* () {
      const baseDecision = yield* base.evaluate(request)
      if (baseDecision._tag === "Deny") return baseDecision
      const rules = yield* store.rules
      const rule = matchingRule({ rules }, request.call.name, request.call.params)
      if (rule === undefined) return baseDecision
      switch (rule.level) {
        case "allow":
          return { _tag: "Allow" }
        case "deny":
          return rule.reason === undefined ? { _tag: "Deny" } : { _tag: "Deny", reason: rule.reason }
        case "ask":
          return { _tag: "Ask", token: tokenFor(request) }
      }
    }),
)

/** @experimental Policy from a static ruleset. */
export const layerRuleset = (ruleset: Ruleset): Layer.Layer<Permissions> =>
  Layer.succeed(
    Permissions,
    Permissions.of({
      evaluate: (request) => Effect.succeed(decisionFor(ruleset, request)),
    }),
  )

/** @experimental Permission policy that allows every call. */
export const layerAllowAll: Layer.Layer<Permissions> = Layer.succeed(
  Permissions,
  Permissions.of({
    evaluate: () => Effect.succeed({ _tag: "Allow" }),
  }),
)

/** @experimental Non-durable in-memory remembered-rule store. */
export const layerRuleStoreMemory = (initialRules: ReadonlyArray<Rule> = []): Layer.Layer<RuleStore> =>
  Layer.effect(
    RuleStore,
    Ref.make<ReadonlyArray<Rule>>(initialRules).pipe(
      Effect.map((rules) =>
        RuleStore.of({
          remember: (rule) =>
            Ref.update(rules, (current) => [...current.filter((existing) => existing.pattern !== rule.pattern), rule]),
          rules: Ref.get(rules),
        }),
      ),
    ),
  )

/** @experimental */
export const layerRuleStoreTest = (implementation: RuleStoreInterface): Layer.Layer<RuleStore> =>
  Layer.succeed(RuleStore, RuleStore.of(implementation))

/** @experimental */
export const layerTest = (implementation: Interface): Layer.Layer<Permissions> =>
  Layer.succeed(Permissions, Permissions.of(implementation))
