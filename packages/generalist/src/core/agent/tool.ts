import { Cause, Effect, Function, Layer, Option, Schema } from "effect"
import { Prompt, Tool } from "effect/unstable/ai"
import { type Agent, type Result, type RunError, type RunRequirements, generate } from "./service.js"
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

import { DriverInterpreter } from "../durable/driver/interpreter.js"
import { Exhausted, GrantWidened, type RunBudget } from "../durable/run-budget.js"
import { RegistrationError, type Registration } from "./tool/registration.js"

export { RegistrationError }

export const register: {
  <R, E>(
    layer: Layer.Layer<R, E, never>,
  ): <Tools extends Record<string, Tool.Any>>(agent: Agent<Tools, R>) => Registration<Tools, R>
  <Tools extends Record<string, Tool.Any>, R, E>(
    agent: Agent<Tools, R>,
    layer: Layer.Layer<R, E, never>,
  ): Registration<Tools, R>
} = Function.dual(
  2,
  <Tools extends Record<string, Tool.Any>, R, E>(
    agent: Agent<Tools, R>,
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
      run: (options) =>
        Effect.scoped(
          Effect.flatMap(Layer.build(registrationLayer), (services) =>
            generate(agent, options).pipe(Effect.provideContext(services)),
          ),
        ),
      requirements: (value) => value,
    }
  },
)

type AgentToolRunOptions = { readonly prompt: Prompt.RawInput; readonly inheritedBudget?: RunBudget }

const defaultParameters = Schema.Struct({ prompt: Schema.String })

type DefaultParameters = typeof defaultParameters
type DefaultSuccess = typeof Schema.String
type ToolInput = typeof Schema.Unknown.Type

/** @experimental */
export interface AsToolOptions<
  Name extends string = string,
  Parameters extends Schema.Top = DefaultParameters,
  Success extends Schema.Top = DefaultSuccess,
> {
  readonly name?: Name
  readonly description?: string
  readonly parameters?: Parameters
  readonly success?: Success
  readonly toPrompt?: (params: Parameters["Type"]) => Prompt.RawInput
  readonly fromResult?: (result: Result) => Success["Type"]
}

/** @experimental A schema-backed tool with a stable name and closed invocation. */
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

/** @experimental */
export interface AgentToolToolkit<_Name extends string, Parameters extends Schema.Top, Success extends Schema.Top, R> {
  readonly name: string
  readonly tool: AgentToolTool<Parameters, Success>
  readonly tools: { readonly [name: string]: AgentToolTool<Parameters, Success> }
  readonly parametersSchema: Schema.Top
  readonly successSchema: Schema.Top
  readonly invoke: (params: ToolInput) => Effect.Effect<Success["Type"], string, R>
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
    return `run budget exhausted (${error.dimension})`
  }
  if (Schema.is(GrantWidened)(error)) {
    return `child budget grant widened (${error.dimension})`
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

const defaultPrompt = (params: ToolInput): Prompt.RawInput =>
  Option.getOrElse(
    Schema.decodeUnknownOption(defaultParameters)(params).pipe(Option.map((decoded) => decoded.prompt)),
    () => String(params),
  )

const defaultResult = (result: Result): string => result.text

const promptFor = <Parameters extends Schema.Top>(
  schema: Parameters | undefined,
  callback: ((params: Parameters["Type"]) => Prompt.RawInput) | undefined,
  params: ToolInput,
): Effect.Effect<Prompt.RawInput, string, Parameters["DecodingServices"]> => {
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
  callback: ((result: Result) => Success["Type"]) | undefined,
  result: Result,
): Effect.Effect<unknown, string> =>
  Effect.try({
    try: () => (callback === undefined ? defaultResult(result) : callback(result)),
    catch: errorMessage,
  })

const lazyHandled = <Name extends string, Parameters extends Schema.Top, Success extends Schema.Top, R>(
  tool: AgentToolTool<Parameters, Success>,
  name: string,
  parameters: Parameters | DefaultParameters,
  invoke: (params: ToolInput) => Effect.Effect<ToolInput, string, R>,
): AgentToolToolkit<Name, Parameters, Success, R> => ({
  name,
  tool,
  tools: { [name]: tool },
  parametersSchema: parameters,
  successSchema: tool.successSchema,
  invoke,
  requirements: (value) => value,
})

/** @experimental */
export const asTool: {
  <
    const Name extends string = string,
    Parameters extends Schema.Top = DefaultParameters,
    Success extends Schema.Top = DefaultSuccess,
  >(
    options?: AsToolOptions<Name, Parameters, Success>,
  ): <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent<Tools, R> | Registration<Tools, R>,
  ) => AgentToolToolkit<
    Name,
    Parameters,
    Success,
    RunRequirements<Tools, R, AgentToolRunOptions> | Parameters["DecodingServices"]
  >
  <
    Tools extends Record<string, Tool.Any>,
    R,
    const Name extends string = string,
    Parameters extends Schema.Top = DefaultParameters,
    Success extends Schema.Top = DefaultSuccess,
  >(
    agent: Agent<Tools, R> | Registration<Tools, R>,
    options?: AsToolOptions<Name, Parameters, Success>,
  ): AgentToolToolkit<
    Name,
    Parameters,
    Success,
    RunRequirements<Tools, R, AgentToolRunOptions> | Parameters["DecodingServices"]
  >
} = Function.dual(
  (args) => args.length !== 1 || "name" in args[0],
  <
    Tools extends Record<string, Tool.Any>,
    R,
    const Name extends string = string,
    Parameters extends Schema.Top = DefaultParameters,
    Success extends Schema.Top = DefaultSuccess,
  >(
    agent: Agent<Tools, R> | Registration<Tools, R>,
    options: AsToolOptions<Name, Parameters, Success> = {},
  ): AgentToolToolkit<
    Name,
    Parameters,
    Success,
    RunRequirements<Tools, R, AgentToolRunOptions> | Parameters["DecodingServices"]
  > => {
    const name = options.name ?? agent.name
    const parameters = options.parameters ?? defaultParameters
    const success = options.success ?? Schema.String
    const handler = (
      params: ToolInput,
    ): Effect.Effect<
      ToolInput,
      string,
      RunRequirements<Tools, R, AgentToolRunOptions> | Parameters["DecodingServices"]
    > =>
      Effect.gen(function* () {
        const prompt = yield* promptFor(options.parameters, options.toPrompt, params)
        const runChild = (runOptions: AgentToolRunOptions) => {
          const execution: Effect.Effect<
            Result,
            RunError | RegistrationError,
            RunRequirements<Tools, R, AgentToolRunOptions>
          > = "run" in agent ? agent.run(runOptions) : generate(agent, runOptions)
          const handled: Effect.Effect<Result, string, RunRequirements<Tools, R, AgentToolRunOptions>> = execution.pipe(
            Effect.catchCause((cause) => {
              if (Cause.hasInterrupts(cause)) return Effect.interrupt
              return Effect.fail(causeMessage(agent.name, cause))
            }),
          )
          return handled
        }
        const interpreter = yield* Effect.serviceOption(DriverInterpreter)
        if (Option.isNone(interpreter)) {
          const result = yield* runChild({ prompt })
          return yield* resultFor(options.success, options.fromResult, result)
        }
        const grant = "budget" in agent && agent.budget !== undefined ? agent.budget : {}
        const childBudget = yield* interpreter.value
          .reserveChild(grant)
          .pipe(
            Effect.mapError((error) =>
              Schema.is(Exhausted)(error) || Schema.is(GrantWidened)(error) ? errorMessage(error) : errorMessage(error),
            ),
          )
        const result = yield* runChild({ prompt, inheritedBudget: childBudget }).pipe(
          Effect.ensuring(interpreter.value.refundChild(childBudget).pipe(Effect.orDie)),
        )
        return yield* resultFor(options.success, options.fromResult, result)
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
