/* oxlint-disable typescript/no-unsafe-argument, typescript/no-unsafe-member-access, typescript/no-unsafe-return -- Effect AI's heterogeneous Tool.Any erases its name and schema parameters to any; validation establishes the Tool identity before these fields are retained. */
import { Brand, Effect, Function, Predicate, Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import type {
  Any as AnyAgent,
  ClosedServices as AgentClosedServices,
  Requirements as AgentRequirements,
} from "../agent/lifecycle/definition.js"
import type { ToolContext } from "../tools/tool-context.js"
import * as CodeExecutor from "./code-executor.js"
import type { ProgramAuthorizationFailure } from "./capabilities.js"
import { ProgramReplayPolicy } from "./handlers.js"

/** Stable nominal declaration identity attached only by {@link step}. */
export const StepTypeId = "generalist/runtime/CodeMode/Step" as const

/** Hard maxima granted to one generated Program. */
export interface Budget {
  readonly agentRuns: number
  readonly concurrency: number
  readonly toolCalls: number
  readonly tokens: number
  readonly wallClockMillis: number
  readonly logBytes: number
  readonly outputBytes: number
}

/** One Effect AI Tool that generated code may call. */
export interface ToolGrant<T extends Tool.Any> {
  readonly tool: T
  readonly handlerVersion: string
  readonly replay: ProgramReplayPolicy
}

/** One exact Agent selection that generated code may start as a child. */
export interface AgentGrant<A extends AnyAgent> {
  readonly agent: A
  readonly selection: string
  readonly handlerVersion: string
  readonly replay: ProgramReplayPolicy
}

interface StepDefinition<
  Name extends string,
  InputSchema extends Schema.Top,
  OutputSchema extends Schema.Top,
  FailureSchema extends Schema.Top,
  StepServices,
> {
  readonly name: Name
  readonly handlerVersion: string
  readonly input: InputSchema
  readonly output: OutputSchema
  readonly failure: FailureSchema
  readonly replay: ProgramReplayPolicy
  readonly authorize: (input: InputSchema["Type"]) => Effect.Effect<boolean, ProgramAuthorizationFailure, StepServices>
  readonly execute: (
    input: InputSchema["Type"],
  ) => Effect.Effect<OutputSchema["Type"], FailureSchema["Type"], StepServices>
}

/** One typed application operation that generated code may call. */
export type Step<
  Name extends string,
  InputSchema extends Schema.Top,
  OutputSchema extends Schema.Top,
  FailureSchema extends Schema.Top,
  StepServices,
> = Brand.Branded<StepDefinition<Name, InputSchema, OutputSchema, FailureSchema, StepServices>, typeof StepTypeId>

/** Erased declaration identity retained in heterogeneous Agent definitions. */
export type StepDeclaration = Brand.Branded<
  {
    readonly name: string
    readonly handlerVersion: string
    readonly input: Schema.Top
    readonly output: Schema.Top
    readonly failure: Schema.Top
    readonly replay: ProgramReplayPolicy
  },
  typeof StepTypeId
>

/** Complete declaration of the code-mode authority available to one Agent. */
export interface Options<
  Tools extends ReadonlyArray<ToolGrant<Tool.Any>>,
  Agents extends ReadonlyArray<AgentGrant<AnyAgent>>,
  Steps extends ReadonlyArray<StepDeclaration>,
> {
  readonly tools: Tools
  readonly agents: Agents
  readonly steps: Steps
  readonly executor: CodeExecutor.Identity
  readonly maxSourceBytes: number
  readonly budget: Budget
}

/** Any code-mode declaration after its authoring types have been hidden. */
export type AnyOptions = Options<
  ReadonlyArray<ToolGrant<Tool.Any>>,
  ReadonlyArray<AgentGrant<AnyAgent>>,
  ReadonlyArray<StepDeclaration>
>

/** Services used by one declared step. */
export type StepRequirements<S> =
  S extends Step<infer _Name, infer _InputSchema, infer _OutputSchema, infer _FailureSchema, infer StepServices>
    ? StepServices
    : never

/** Typed failure produced by one declared step. */
export type StepFailure<S> =
  S extends Step<infer _Name, infer _InputSchema, infer _OutputSchema, infer FailureSchema, infer _Requirements>
    ? FailureSchema["Type"]
    : never

type GrantedTool<C> = C extends { readonly tools: ReadonlyArray<ToolGrant<Tool.Any>> }
  ? C["tools"][number]["tool"]
  : never
type GrantedAgent<C> = C extends { readonly agents: ReadonlyArray<AgentGrant<AnyAgent>> }
  ? C["agents"][number]["agent"]
  : never
type GrantedStep<C> = C extends { readonly steps: ReadonlyArray<StepDeclaration> } ? C["steps"][number] : never

type GrantedAgentRequirements<A extends AnyAgent> =
  A["toolkit"] extends Toolkit.Toolkit<infer Tools>
    ? AgentClosedServices<Tools, AgentRequirements<A>, A["input"], A["output"]> | A["input"]["DecodingServices"]
    : never

type StepCodecRequirements<S> = S extends {
  readonly input: infer InputSchema extends Schema.Top
  readonly output: infer OutputSchema extends Schema.Top
  readonly failure: infer FailureSchema extends Schema.Top
}
  ? InputSchema["DecodingServices"] | OutputSchema["EncodingServices"] | FailureSchema["EncodingServices"]
  : never

/** Services inferred from one declaration without widening its handlers or step environments. */
export type Requirements<C> =
  | (C extends AnyOptions ? CodeExecutor.CodeExecutor : never)
  | Exclude<Tool.HandlerServices<GrantedTool<C>>, ToolContext>
  | Tool.HandlersFor<{
      readonly [Name in Tool.Name<GrantedTool<C>>]: Extract<GrantedTool<C>, { readonly name: Name }>
  }>
  | GrantedAgentRequirements<Extract<GrantedAgent<C>, AnyAgent>>
  | StepRequirements<GrantedStep<C>>
  | StepCodecRequirements<GrantedStep<C>>

/** Agent option fragment retained for declaration-oriented type composition. */
export interface AgentOptionsWithCodeMode<
  Tools extends ReadonlyArray<ToolGrant<Tool.Any>>,
  Agents extends ReadonlyArray<AgentGrant<AnyAgent>>,
  Steps extends ReadonlyArray<StepDeclaration>,
> {
  readonly codeMode?: Options<Tools, Agents, Steps>
}

/** A code-mode declaration is malformed and cannot be registered. */
export class DeclarationError extends Schema.TaggedError<DeclarationError>()("generalist/code-mode/DeclarationError", {
  field: Schema.Literals(["tools", "agents", "steps", "executor", "maxSourceBytes", "budget"]),
  reason: Schema.Literals(["duplicate-name", "identity-invalid", "version-invalid", "limit-invalid", "not-agent-tool"]),
  name: Schema.optionalKey(Schema.String),
}) {}

const BudgetFields = [
  "agentRuns",
  "concurrency",
  "toolCalls",
  "tokens",
  "wallClockMillis",
  "logBytes",
  "outputBytes",
] as const

/** @internal Immutable declaration snapshot retained by one registered revision. */
export interface ValidatedOptions extends Omit<AnyOptions, "executor" | "budget" | "steps"> {
  readonly executor: CodeExecutor.Identity
  readonly budget: Readonly<Budget>
  readonly steps: ReadonlyArray<Step<string, Schema.Top, Schema.Top, Schema.Top, unknown>>
}

const declarationFailure = (
  field: DeclarationError["field"],
  reason: DeclarationError["reason"],
  name?: string,
): DeclarationError =>
  DeclarationError.make({ field, reason, ...Object.assign({}, name === undefined ? undefined : { name }) })

const validIdentity = (value: string): boolean => value.length > 0 && value.length <= 128 && value.trim() === value

const validateUnique = <A>(
  values: ReadonlyArray<A>,
  nameOf: (value: A) => string,
  field: "tools" | "agents" | "steps",
): void => {
  const names = new Set<string>()
  for (const value of values) {
    const name = nameOf(value)
    if (!validIdentity(name)) throw declarationFailure(field, "identity-invalid", name)
    if (names.has(name)) throw declarationFailure(field, "duplicate-name", name)
    names.add(name)
  }
}

const validateToolGrants = (toolkit: Toolkit.Any, grants: AnyOptions["tools"]): void => {
  for (const grant of grants) {
    if (!Predicate.hasProperty(grant.tool, Tool.TypeId)) throw declarationFailure("tools", "identity-invalid")
    if (!Predicate.isString(grant.handlerVersion) || !validIdentity(grant.handlerVersion)) {
      throw declarationFailure("tools", "version-invalid", grant.tool.name)
    }
    if (!Schema.is(ProgramReplayPolicy)(grant.replay)) {
      throw declarationFailure("tools", "identity-invalid", grant.tool.name)
    }
    if (toolkit.tools[grant.tool.name] !== grant.tool) {
      throw declarationFailure("tools", "not-agent-tool", grant.tool.name)
    }
  }
}

const validateAgentGrants = (grants: AnyOptions["agents"]): void => {
  for (const grant of grants) {
    if (!Predicate.hasProperty(grant.agent, "generalist/core/Agent")) {
      throw declarationFailure("agents", "identity-invalid", grant.selection)
    }
    if (!Predicate.isString(grant.handlerVersion) || !validIdentity(grant.handlerVersion)) {
      throw declarationFailure("agents", "version-invalid", grant.selection)
    }
    if (!Schema.is(ProgramReplayPolicy)(grant.replay)) {
      throw declarationFailure("agents", "identity-invalid", grant.selection)
    }
  }
}

const validateSteps = (
  values: AnyOptions["steps"],
): ReadonlyArray<Step<string, Schema.Top, Schema.Top, Schema.Top, unknown>> => {
  const declaredSteps: Array<Step<string, Schema.Top, Schema.Top, Schema.Top, unknown>> = []
  for (const declared of values) {
    if (!isDeclaredStep(declared)) throw declarationFailure("steps", "identity-invalid", declared.name)
    if (!Predicate.isString(declared.handlerVersion) || !validIdentity(declared.handlerVersion)) {
      throw declarationFailure("steps", "version-invalid", declared.name)
    }
    if (
      !Schema.isSchema(declared.input) ||
      !Schema.isSchema(declared.output) ||
      !Schema.isSchema(declared.failure) ||
      !Schema.is(ProgramReplayPolicy)(declared.replay)
    ) {
      throw declarationFailure("steps", "identity-invalid", declared.name)
    }
    declaredSteps.push(declared)
  }
  return declaredSteps
}

/** @internal Validate and snapshot declaration data without invoking a capability or executor. */
export const validateOptions: {
  (options: AnyOptions): (toolkit: Toolkit.Any) => ValidatedOptions
  (toolkit: Toolkit.Any, options: AnyOptions): ValidatedOptions
} = Function.dual(2, (toolkit: Toolkit.Any, options: AnyOptions): ValidatedOptions => {
  let executor: CodeExecutor.Identity
  try {
    executor = CodeExecutor.declareIdentity(options.executor)
  } catch {
    throw declarationFailure("executor", "identity-invalid")
  }
  if (!Number.isSafeInteger(options.maxSourceBytes) || options.maxSourceBytes <= 0) {
    throw declarationFailure("maxSourceBytes", "limit-invalid")
  }
  for (const field of BudgetFields) {
    const value = options.budget[field]
    const minimum = field === "concurrency" ? 1 : 0
    if (!Number.isSafeInteger(value) || value < minimum) throw declarationFailure("budget", "limit-invalid", field)
  }
  validateUnique(options.tools, ({ tool }) => tool.name, "tools")
  validateUnique(options.agents, ({ selection }) => selection, "agents")
  validateUnique(options.steps, ({ name }) => name, "steps")
  validateToolGrants(toolkit, options.tools)
  validateAgentGrants(options.agents)
  const declaredSteps = validateSteps(options.steps)
  return Object.freeze({
    tools: Object.freeze([...options.tools].map((grant) => Object.freeze({ ...grant }))),
    agents: Object.freeze([...options.agents].map((grant) => Object.freeze({ ...grant }))),
    steps: Object.freeze(declaredSteps),
    executor,
    maxSourceBytes: options.maxSourceBytes,
    budget: Object.freeze({ ...options.budget }),
  })
})

const steps = new WeakSet<object>()

/** Construct one nominal typed step without evaluating either callback. */
export const step = <
  const Name extends string,
  InputSchema extends Schema.Top,
  OutputSchema extends Schema.Top,
  FailureSchema extends Schema.Top,
  StepServices,
>(
  definition: StepDefinition<Name, InputSchema, OutputSchema, FailureSchema, StepServices>,
): Step<Name, InputSchema, OutputSchema, FailureSchema, StepServices> => {
  const declared = Brand.nominal<Step<Name, InputSchema, OutputSchema, FailureSchema, StepServices>>()(definition)
  Object.freeze(declared)
  steps.add(declared)
  return declared
}

/** @internal Reject forged step identities before retaining executable callbacks. */
export const isDeclaredStep = (
  value: StepDeclaration,
): value is Step<string, Schema.Top, Schema.Top, Schema.Top, unknown> => Predicate.isObject(value) && steps.has(value)
