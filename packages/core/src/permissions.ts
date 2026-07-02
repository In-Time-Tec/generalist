import { Context, Effect, Layer, Option, Ref, Schema } from "effect"

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

/** @experimental Tool-call information used by permission policies. */
export interface EvaluationRequest {
  readonly tool: string
  readonly params: unknown
  readonly agentName: string
  readonly turn: number
  readonly toolCallId?: string
  readonly sessionId?: string
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

/** @experimental */
export interface Approved {
  readonly _tag: "Approved"
}

/** @experimental */
export interface Denied {
  readonly _tag: "Denied"
  readonly reason?: string
}

/** @experimental */
export interface Always {
  readonly _tag: "Always"
}

/** @experimental Out-of-band answer to a permission ask. */
export type Answer = Approved | Denied | Always

/** @experimental Pending permission ask surfaced to an approver. */
export interface Pending {
  readonly token: string
  readonly tool: string
  readonly params: unknown
  readonly agentName: string
  readonly turn: number
  readonly toolCallId?: string
}

/** @experimental Permission service failure. */
export class PermissionError extends Schema.TaggedErrorClass<PermissionError>()("@batonfx/core/PermissionError", {
  message: Schema.String,
}) {}

/** @experimental Permission policy service boundary. */
export interface Interface {
  readonly evaluate: (request: EvaluationRequest) => Effect.Effect<Decision, PermissionError>
  readonly await: (pending: Pending) => Effect.Effect<Option.Option<Answer>, PermissionError>
}

/** @experimental */
export class Permissions extends Context.Service<Permissions, Interface>()("@batonfx/core/Permissions") {}

/** @experimental Optional remembered-rule store. */
export interface RuleStoreInterface {
  readonly remember: (rule: Rule) => Effect.Effect<void, PermissionError>
}

/** @experimental */
export class RuleStore extends Context.Service<RuleStore, RuleStoreInterface>()("@batonfx/core/PermissionRuleStore") {}

const escapeRegExp = (value: string): string => value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&")

const glob = (pattern: string): RegExp => new RegExp(`^${pattern.split("*").map(escapeRegExp).join(".*")}$`)

const stringValue = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined)

const paramsText = (params: unknown): string => {
  if (typeof params === "string") return params
  if (Array.isArray(params)) return params.map(String).join(" ")
  if (typeof params === "object" && params !== null) {
    const record = params as Readonly<Record<string, unknown>>
    const direct =
      stringValue(record.command) ?? stringValue(record.cmd) ?? stringValue(record.input) ?? stringValue(record.text)
    if (direct !== undefined) return direct
    const args = record.args ?? record.arguments
    if (Array.isArray(args)) return args.map(String).join(" ")
    if (typeof args === "string") return args
  }
  const json = JSON.stringify(params)
  return json === undefined ? String(params) : json
}

/** @experimental Match a permission pattern against a tool call. */
export const matches = (pattern: string, tool: string, params: unknown): boolean => {
  const separator = pattern.indexOf(":")
  if (separator === -1) return glob(pattern).test(tool)
  const toolPattern = pattern.slice(0, separator)
  const paramsPattern = pattern.slice(separator + 1)
  return glob(toolPattern).test(tool) && glob(paramsPattern).test(paramsText(params))
}

const matchingRule = (ruleset: Ruleset, tool: string, params: unknown): Rule | undefined => {
  let matched: Rule | undefined
  for (const rule of ruleset.rules) {
    if (matches(rule.pattern, tool, params)) matched = rule
  }
  return matched
}

/** @experimental Evaluate a ruleset with last-match semantics. */
export const evaluate = (ruleset: Ruleset, tool: string, params: unknown): Level =>
  matchingRule(ruleset, tool, params)?.level ?? ruleset.fallback ?? "ask"

const tokenFor = (request: EvaluationRequest): string =>
  `permission:${request.toolCallId ?? `${request.agentName}:${request.turn}:${request.tool}`}`

const decisionFor = (ruleset: Ruleset, request: EvaluationRequest): Decision => {
  const rule = matchingRule(ruleset, request.tool, request.params)
  const level = rule?.level ?? ruleset.fallback ?? "ask"
  switch (level) {
    case "allow":
      return { _tag: "Allow" }
    case "deny":
      return { _tag: "Deny", ...(rule?.reason === undefined ? {} : { reason: rule.reason }) }
    case "ask":
      return { _tag: "Ask", token: tokenFor(request) }
  }
}

/** @experimental Policy from a static ruleset. */
export const fromRuleset = (ruleset: Ruleset): Layer.Layer<Permissions> =>
  Layer.succeed(
    Permissions,
    Permissions.of({
      evaluate: (request) => Effect.succeed(decisionFor(ruleset, request)),
      await: () => Effect.succeed(Option.none()),
    }),
  )

/** @experimental Permission policy that allows every call. */
export const allowAll: Layer.Layer<Permissions> = Layer.succeed(
  Permissions,
  Permissions.of({
    evaluate: () => Effect.succeed({ _tag: "Allow" }),
    await: () => Effect.succeed(Option.none()),
  }),
)

/** @experimental Options for an in-process interactive permission layer. */
export interface InteractiveOptions {
  readonly ruleset: Ruleset
  readonly onAsk: (pending: Pending) => Effect.Effect<Answer, PermissionError>
}

/** @experimental In-process permission layer whose asks are answered by `onAsk`. */
export const interactive = (options: InteractiveOptions): Layer.Layer<Permissions> =>
  Layer.succeed(
    Permissions,
    Permissions.of({
      evaluate: (request) => Effect.succeed(decisionFor(options.ruleset, request)),
      await: (pending) => options.onAsk(pending).pipe(Effect.map(Option.some)),
    }),
  )

/** @experimental Non-durable in-memory remembered-rule store. */
export const ruleStoreMemory = (initialRules: ReadonlyArray<Rule> = []): Layer.Layer<RuleStore> =>
  Layer.effect(
    RuleStore,
    Ref.make<ReadonlyArray<Rule>>(initialRules).pipe(
      Effect.map((rules) =>
        RuleStore.of({
          remember: (rule) => Ref.update(rules, (current) => [...current, rule]),
        }),
      ),
    ),
  )

/** @experimental */
export const ruleStoreTestLayer = (implementation: RuleStoreInterface): Layer.Layer<RuleStore> =>
  Layer.succeed(RuleStore, RuleStore.of(implementation))

/** @experimental */
export const testLayer = (implementation: Interface): Layer.Layer<Permissions> =>
  Layer.succeed(Permissions, Permissions.of(implementation))
