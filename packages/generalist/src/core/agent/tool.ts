import { Cause, Effect, Function, Layer, Option, Schema } from "effect"
import { LanguageModel, Prompt, Tool } from "effect/unstable/ai"
import { type Agent, run, type RunError, type RunRequirements } from "./service.js"
import {
  AgentError,
  AgentSuspended,
  DuplicateToolCallId,
  MiddlewareViolation,
  ResumeMismatch,
  RunEndedWithoutOutput,
  ToolNameCollision,
  TurnLimitExceeded,
  PolicyStopped,
} from "./event.js"
import { PolicyError as TurnPolicyError } from "../turn/policy.js"

import { DriverInterpreter, DriverJournal, journalNoop } from "../durable/driver/interpreter.js"
import { Exhausted, Invalid as BudgetInvalid, type RunBudget } from "../durable/run-budget.js"
import { RegistrationError, type Registration } from "./tool/registration.js"
import { DriverError, DriverStateInvalid } from "../durable/service.js"
import { childEnd as applyChildEnd, childStart as applyChildStart } from "./lifecycle/hooks.js"
import type { HookFailed } from "../../hooks/index.js"
import { ToolContext } from "../tools/tool-context.js"
import { make as makeFanOut } from "./tool/fan-out.js"

export { RegistrationError }
export {
  type FanOutTool,
  type Member as FanOutMember,
  type Options as FanOutOptions,
  type Parameters as FanOutParameters,
} from "./tool/fan-out.js"

type TextAgent<
  Tools extends Record<string, Tool.Any>,
  R,
  PolicyServices extends R,
  AuthorizationServices extends R,
> = Agent<Tools, R, PolicyServices, AuthorizationServices, typeof Schema.String, typeof Schema.String>

export const register: {
  <R, E>(
    layer: Layer.Layer<R, E, never>,
  ): <Tools extends Record<string, Tool.Any>, PolicyServices extends R, AuthorizationServices extends R>(
    agent: TextAgent<Tools, R, PolicyServices, AuthorizationServices>,
  ) => Registration<Tools, R>
  <Tools extends Record<string, Tool.Any>, R, PolicyServices extends R, AuthorizationServices extends R, E>(
    agent: TextAgent<Tools, R, PolicyServices, AuthorizationServices>,
    layer: Layer.Layer<R, E, never>,
  ): Registration<Tools, R>
} = Function.dual(
  2,
  <Tools extends Record<string, Tool.Any>, R, PolicyServices extends R, AuthorizationServices extends R, E>(
    agent: TextAgent<Tools, R, PolicyServices, AuthorizationServices>,
    layer: Layer.Layer<R, E, never>,
  ): Registration<Tools, R> => {
    const registrationLayer = Layer.effectContext(
      Layer.build(layer).pipe(
        Effect.mapError((cause) =>
          RegistrationError.make({
            agent: agent.name,
            message: `Failed to build services for agent '${agent.name}'`,
            cause,
          }),
        ),
      ),
    )
    return {
      name: agent.name,
      run: (input, options) =>
        Effect.scoped(
          Effect.flatMap(Layer.build(registrationLayer), (services) =>
            run(agent, input, options).pipe(Effect.provideContext(services)),
          ),
        ),
      requirements: (value) => value,
    }
  },
)

type AgentToolRunOptions = { readonly inheritedBudget?: RunBudget }

const defaultParameters = Schema.Struct({ prompt: Schema.String })

type DefaultParameters = typeof defaultParameters
type DefaultSuccess = typeof Schema.String
type ToolInput = typeof Schema.Unknown.Type
export interface AsToolOptions<
  Name extends string = string,
  Parameters extends Schema.Top = DefaultParameters,
  Success extends Schema.Top = DefaultSuccess,
  ModelR = never,
> {
  readonly name?: Name
  readonly description?: string
  readonly parameters?: Parameters
  readonly success?: Success
  readonly toPrompt?: (params: Parameters["Type"]) => string
  readonly fromResult?: (output: string) => Success["Type"]
  /** Model layer for the child run. Omit to inherit the model provided to the parent run. */
  readonly model?: Layer.Layer<LanguageModel.LanguageModel, never, ModelR>
}

/** A schema-backed tool with a stable name and closed invocation. */
type AgentToolTool<Parameters extends Schema.Top, Success extends Schema.Top> = Tool.Tool<
  string,
  {
    readonly parameters: Parameters | DefaultParameters
    readonly success: Success | DefaultSuccess
    readonly failure: typeof Schema.String
    readonly failureMode: "return"
  },
  never
>
export interface AgentToolToolkit<_Name extends string, Parameters extends Schema.Top, Success extends Schema.Top, R> {
  readonly name: string
  readonly tool: AgentToolTool<Parameters, Success>
  readonly tools: { readonly [name: string]: AgentToolTool<Parameters, Success> }
  readonly parametersSchema: Schema.Top
  readonly successSchema: Schema.Top
  readonly invoke: (
    params: ToolInput,
  ) => Effect.Effect<Success["Type"], string | HookFailed | DriverError | DriverStateInvalid, R>
  readonly requirements: (value: R) => R
}

const errorMessage = (error: typeof Schema.Unknown.Type): string => {
  if (Schema.is(AgentSuspended)(error)) {
    return `suspended on ${error.waits.map((wait) => `${wait.call.name}: ${wait.reason}`).join(", ")}`
  }
  if (Schema.is(AgentError)(error)) {
    return `failed on turn ${error.turn}: ${error.message}`
  }
  if (Schema.is(ResumeMismatch)(error)) {
    return `resume mismatch: ${error.reason}`
  }
  if (Schema.is(TurnLimitExceeded)(error)) {
    return `turn limit exceeded at turn ${error.turn}`
  }
  if (Schema.is(RunEndedWithoutOutput)(error)) {
    const reason = error.finishReason ?? "no terminal event"
    return `ended turn ${error.turn} without output (provider finish reason: ${reason})`
  }
  if (Schema.is(PolicyStopped)(error)) {
    return `policy stopped at turn ${error.turn}: ${error.reason._tag}`
  }
  if (Schema.is(TurnPolicyError)(error)) {
    return `turn policy failed: ${error.message}`
  }
  if (Schema.is(Exhausted)(error)) {
    return `run budget exhausted (${error.budget})`
  }
  if (Schema.is(BudgetInvalid)(error)) {
    return `child budget grant invalid (${error.message})`
  }
  if (Schema.is(MiddlewareViolation)(error)) {
    return `middleware violation on turn ${error.turn}: ${error.detail}`
  }
  if (Schema.is(DuplicateToolCallId)(error)) {
    return `duplicate tool-call ID '${error.id}' at position ${error.duplicateIndex} (first at ${error.firstIndex})`
  }
  if (Schema.is(ToolNameCollision)(error)) {
    const originName = (origin: ToolNameCollision["origins"][number]): string => {
      switch (origin._tag) {
        case "Static":
          return `static:${origin.agent}`
        case "Builtin":
          return `builtin:${origin.builtin}`
        case "Skill":
          return `skill:${origin.skill}`
        case "Handoff":
          return `handoff:${origin.specialist}`
      }
    }
    return `tool name collision: ${error.name} (${error.origins.map(originName).join(", ")})`
  }
  return error instanceof globalThis.Error ? `${error.name}: ${error.message}` : String(error)
}

const causeMessage = (agentName: string, cause: Cause.Cause<unknown>): string =>
  `sub-agent '${agentName}' could not complete: ${errorMessage(Cause.squash(cause))}`

const defaultPrompt = (params: ToolInput): string =>
  Option.getOrElse(
    Schema.decodeUnknownOption(defaultParameters)(params).pipe(Option.map((decoded) => decoded.prompt)),
    () => String(params),
  )

const defaultResult = (output: string): string => output

const promptFor = <Parameters extends Schema.Top>(
  schema: Parameters | undefined,
  callback: ((params: Parameters["Type"]) => string) | undefined,
  params: ToolInput,
): Effect.Effect<string, string, Parameters["DecodingServices"]> => {
  if (schema === undefined) {
    const decoded = Schema.decodeUnknownOption(defaultParameters)(params)
    if (Option.isNone(decoded)) return Effect.fail("Invalid agent-tool parameters")
    return Effect.try({
      try: () => (callback === undefined ? defaultPrompt(params) : callback(decoded.value)),
      catch: errorMessage,
    })
  }
  return Schema.decodeUnknownEffect(schema)(params).pipe(
    Effect.mapError(() => "Invalid agent-tool parameters"),
    Effect.flatMap((value) =>
      Effect.try({
        try: () => (callback === undefined ? defaultPrompt(params) : callback(value)),
        catch: errorMessage,
      }),
    ),
  )
}

const resultFor = <Success extends Schema.Top>(
  schema: Success | undefined,
  callback: ((output: string) => Success["Type"]) | undefined,
  output: string,
): Effect.Effect<unknown, string> =>
  Effect.try({
    try: () => (callback === undefined ? defaultResult(output) : callback(output)),
    catch: errorMessage,
  })

const lazyHandled = <Name extends string, Parameters extends Schema.Top, Success extends Schema.Top, R>(
  tool: AgentToolTool<Parameters, Success>,
  name: string,
  parameters: Parameters | DefaultParameters,
  invoke: (params: ToolInput) => Effect.Effect<ToolInput, string | HookFailed | DriverError | DriverStateInvalid, R>,
): AgentToolToolkit<Name, Parameters, Success, R> => ({
  name,
  tool,
  tools: { [name]: tool },
  parametersSchema: parameters,
  successSchema: tool.successSchema,
  invoke,
  requirements: (value) => value,
})
export const asTool: {
  <
    const Name extends string = string,
    Parameters extends Schema.Top = DefaultParameters,
    Success extends Schema.Top = DefaultSuccess,
    ModelR = never,
  >(
    options?: AsToolOptions<Name, Parameters, Success, ModelR>,
  ): <Tools extends Record<string, Tool.Any>, R, PolicyServices extends R, AuthorizationServices extends R>(
    agent: TextAgent<Tools, R, PolicyServices, AuthorizationServices> | Registration<Tools, R>,
  ) => AgentToolToolkit<
    Name,
    Parameters,
    Success,
    RunRequirements<Tools, R, AgentToolRunOptions> | Parameters["DecodingServices"] | ModelR
  >
  <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices extends R,
    AuthorizationServices extends R,
    const Name extends string = string,
    Parameters extends Schema.Top = DefaultParameters,
    Success extends Schema.Top = DefaultSuccess,
    ModelR = never,
  >(
    agent: TextAgent<Tools, R, PolicyServices, AuthorizationServices> | Registration<Tools, R>,
    options?: AsToolOptions<Name, Parameters, Success, ModelR>,
  ): AgentToolToolkit<
    Name,
    Parameters,
    Success,
    RunRequirements<Tools, R, AgentToolRunOptions> | Parameters["DecodingServices"] | ModelR
  >
} = Function.dual(
  (args) => args.length !== 1 || "name" in args[0],
  <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices extends R,
    AuthorizationServices extends R,
    const Name extends string = string,
    Parameters extends Schema.Top = DefaultParameters,
    Success extends Schema.Top = DefaultSuccess,
    ModelR = never,
  >(
    agent: TextAgent<Tools, R, PolicyServices, AuthorizationServices> | Registration<Tools, R>,
    options: AsToolOptions<Name, Parameters, Success, ModelR> = {},
  ): AgentToolToolkit<
    Name,
    Parameters,
    Success,
    RunRequirements<Tools, R, AgentToolRunOptions> | Parameters["DecodingServices"] | ModelR
  > => {
    const name = options.name ?? agent.name
    const parameters = options.parameters ?? defaultParameters
    const success = options.success ?? Schema.String
    const handler = (
      params: ToolInput,
    ): Effect.Effect<
      ToolInput,
      string | HookFailed | DriverError | DriverStateInvalid,
      RunRequirements<Tools, R, AgentToolRunOptions> | Parameters["DecodingServices"] | ModelR
    > =>
      Effect.gen(function* () {
        const authoredPrompt = yield* promptFor(options.parameters, options.toPrompt, params)
        const parent = yield* Effect.serviceOption(ToolContext)
        const parentContext = Option.getOrUndefined(parent)
        const runId = parentContext?.runId ?? `local:${name}`
        const agentName = parentContext?.agentName ?? "process-local"
        const turn = parentContext?.turn ?? 0
        const operation = parentContext?.toolCallId ?? `agent-tool:${name}`
        const started = yield* applyChildStart({
          runId,
          agentName,
          turn,
          child: {
            operation,
            selection: agent.name,
            prompt: Prompt.make(authoredPrompt),
          },
        })
        if (started.blocked !== undefined) {
          return yield* Effect.fail(`ChildStart hook blocked '${agent.name}': ${started.blocked}`)
        }
        const child = started.input.child
        const runChild = (prompt: string, runOptions: AgentToolRunOptions) => {
          const base: Effect.Effect<
            string,
            RunError | RegistrationError,
            RunRequirements<Tools, R, AgentToolRunOptions>
          > = "run" in agent ? agent.run(prompt, runOptions) : run(agent, prompt, runOptions)
          const execution: Effect.Effect<
            string,
            RunError | RegistrationError,
            RunRequirements<Tools, R, AgentToolRunOptions> | ModelR
          > =
            options.model === undefined
              ? base
              : Effect.scoped(
                  Layer.build(options.model).pipe(
                    Effect.flatMap((modelContext) => base.pipe(Effect.provide(modelContext))),
                  ),
                )
          const handled: Effect.Effect<string, string, RunRequirements<Tools, R, AgentToolRunOptions> | ModelR> =
            execution.pipe(
              Effect.catchCause((cause) => {
                if (Cause.hasInterrupts(cause)) return Effect.interrupt
                return Effect.fail(causeMessage(agent.name, cause))
              }),
            )
          return handled
        }
        const interpreter = yield* Effect.serviceOption(DriverInterpreter)
        let result: string
        if (Option.isNone(interpreter)) {
          result = yield* runChild(authoredPrompt, {})
        } else {
          const grant = "budget" in agent && agent.budget !== undefined ? agent.budget : {}
          const childBudget = yield* interpreter.value.reserveChild(grant).pipe(Effect.mapError(errorMessage))
          result = yield* runChild(authoredPrompt, { inheritedBudget: childBudget }).pipe(
            Effect.provideService(DriverJournal, journalNoop),
            Effect.ensuring(interpreter.value.refundChild(childBudget).pipe(Effect.orDie)),
          )
        }
        const ended = yield* applyChildEnd({
          runId,
          agentName,
          turn,
          child,
          result,
        })
        if (ended.blocked !== undefined) {
          return yield* Effect.fail(`ChildEnd hook blocked '${agent.name}' result: ${ended.blocked}`)
        }
        if (!Schema.is(Schema.String)(ended.input.result)) return ended.input.result
        return yield* resultFor(options.success, options.fromResult, ended.input.result)
      })
    const tool = Tool.make(name, {
      description: options.description,
      parameters,
      success,
      failure: Schema.String,
      failureMode: "return",
    })
    return lazyHandled<
      Name,
      Parameters,
      Success,
      RunRequirements<Tools, R, AgentToolRunOptions> | Parameters["DecodingServices"]
    >(tool, name, parameters, handler)
  },
)

/** Declare a model-callable fan-out over an exact set of child Agents. */
export const fanOut: typeof makeFanOut = makeFanOut
