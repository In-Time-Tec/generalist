import { Cause, Effect, Function, Option, Schema } from "effect"
import { Prompt, Tool } from "effect/unstable/ai"
import { type Agent, type Result, type RunOptions, generate } from "./agent.js"
import {
  AgentError,
  AgentSuspended,
  DuplicateToolCallId,
  MiddlewareViolation,
  ResumeMismatch,
  RunEndedWithoutOutput,
  ToolNameCollision,
  TurnLimitExceeded,
  TurnPolicyStopped,
} from "./agent-event.js"
import { TurnPolicyError } from "../turn/turn-policy.js"
import { reserveChildBudget, refundChildBudget } from "../durable/driver-run.js"
import { DriverInterpreter } from "../durable/driver-interpreter.js"
import { RunBudgetExhausted, RunBudgetGrantWidened } from "../durable/run-budget.js"
import type { Registration } from "../policy/handoff.js"

const defaultParameters = Schema.Struct({ prompt: Schema.String })

type DefaultParameters = typeof defaultParameters
type DefaultSuccess = typeof Schema.String
type ToolMap = { readonly [name: string]: Tool.Any }

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
export interface AgentToolToolkit<
  _Name extends string,
  _Parameters extends Schema.Top,
  _Success extends Schema.Top,
  R,
> {
  readonly name: string
  readonly tool: Tool.Any
  readonly tools: ToolMap
  readonly parametersSchema: Schema.Top
  readonly successSchema: Schema.Top
  readonly invoke: (params: unknown) => Effect.Effect<unknown, string, R>
  readonly requirements: (value: R) => R
}

const errorMessage = (error: unknown): string => {
  if (Schema.is(AgentSuspended)(error)) {
    return `suspended on ${error.tool_name}: ${error.reason}`
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
  if (Schema.is(TurnPolicyStopped)(error)) {
    return `policy stopped at turn ${error.turn}: ${error.reason._tag}`
  }
  if (Schema.is(TurnPolicyError)(error)) {
    return `turn policy failed: ${error.message}`
  }
  if (Schema.is(RunBudgetExhausted)(error)) {
    return `run budget exhausted (${error.dimension})`
  }
  if (Schema.is(RunBudgetGrantWidened)(error)) {
    return `child budget grant widened (${error.dimension})`
  }
  if (Schema.is(MiddlewareViolation)(error)) {
    return `middleware violation on turn ${error.turn}: ${error.detail}`
  }
  if (Schema.is(DuplicateToolCallId)(error)) {
    return `duplicate tool-call ID '${error.id}' at position ${error.duplicateIndex} (first at ${error.firstIndex})`
  }
  if (Schema.is(ToolNameCollision)(error)) {
    return `tool name collision: ${error.name} (${error.origins
      .map((origin) =>
        origin._tag === "Static"
          ? `static:${origin.agent}`
          : origin._tag === "Builtin"
            ? `builtin:${origin.builtin}`
            : origin._tag === "Skill"
              ? `skill:${origin.skill}`
              : `handoff:${origin.specialist}`,
      )
      .join(", ")})`
  }
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

const causeMessage = (agentName: string, cause: Cause.Cause<unknown>): string =>
  `sub-agent '${agentName}' could not complete: ${errorMessage(Cause.squash(cause))}`

const defaultPrompt = (params: unknown): Prompt.RawInput =>
  typeof params === "object" && params !== null && "prompt" in params && typeof params.prompt === "string"
    ? params.prompt
    : String(params)

const defaultResult = (result: Result): string => result.text

const promptFor = <Parameters extends Schema.Top>(
  schema: Parameters | undefined,
  callback: ((params: Parameters["Type"]) => Prompt.RawInput) | undefined,
  params: unknown,
): Effect.Effect<Prompt.RawInput, string> => {
  if (schema !== undefined && !Schema.is(schema)(params)) return Effect.fail("Invalid agent-tool parameters")
  return Effect.try({
    try: () =>
      callback === undefined
        ? defaultPrompt(params)
        : callback(schema === undefined ? (params as Parameters["Type"]) : params),
    catch: errorMessage,
  })
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
  tool: Tool.Any,
  name: string,
  parameters: Parameters,
  invoke: (params: unknown) => Effect.Effect<unknown, string, R>,
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
    agent: Agent<Tools, R> | Registration,
  ) => AgentToolToolkit<Name, Parameters, Success, R>
  <
    Tools extends Record<string, Tool.Any>,
    R,
    const Name extends string = string,
    Parameters extends Schema.Top = DefaultParameters,
    Success extends Schema.Top = DefaultSuccess,
  >(
    agent: Agent<Tools, R> | Registration,
    options?: AsToolOptions<Name, Parameters, Success>,
  ): AgentToolToolkit<Name, Parameters, Success, R>
} = Function.dual(
  (args) => args.length !== 1 || "name" in args[0],
  <
    Tools extends Record<string, Tool.Any>,
    R,
    const Name extends string = string,
    Parameters extends Schema.Top = DefaultParameters,
    Success extends Schema.Top = DefaultSuccess,
  >(
    agent: Agent<Tools, R> | Registration,
    options: AsToolOptions<Name, Parameters, Success> = {},
  ): AgentToolToolkit<Name, Parameters, Success, R> => {
    const name = options.name ?? agent.name
    const parameters = options.parameters ?? defaultParameters
    const success = options.success ?? Schema.String
    const handler = (params: unknown): Effect.Effect<unknown, string, R> =>
      Effect.gen(function* () {
        const prompt = yield* promptFor(options.parameters, options.toPrompt, params)
        const runChild = (runOptions: RunOptions) => {
          const execution = "run" in agent ? agent.run(runOptions) : generate(agent, runOptions)
          return execution.pipe(
            Effect.catchCause((cause) => {
              if (Cause.hasInterrupts(cause)) return Effect.interrupt
              return Effect.fail(causeMessage(agent.name, cause))
            }),
          )
        }
        const interpreter = yield* Effect.serviceOption(DriverInterpreter)
        if (Option.isNone(interpreter)) {
          const result = yield* runChild({ prompt })
          return yield* resultFor(options.success, options.fromResult, result)
        }
        const grant = "budget" in agent && agent.budget !== undefined ? agent.budget : {}
        const childBudget = yield* reserveChildBudget(grant).pipe(
          Effect.mapError((error) =>
            Schema.is(RunBudgetExhausted)(error) || Schema.is(RunBudgetGrantWidened)(error)
              ? errorMessage(error)
              : errorMessage(error),
          ),
        )
        const result = yield* runChild({ prompt, inheritedBudget: childBudget }).pipe(
          Effect.ensuring(refundChildBudget(childBudget)),
        )
        return yield* resultFor(options.success, options.fromResult, result)
      }) as Effect.Effect<unknown, string, R>
    const tool: Tool.Any = Tool.make(name, {
      ...(options.description === undefined ? {} : { description: options.description }),
      parameters,
      success,
      failure: Schema.String,
      failureMode: "return",
    })
    return lazyHandled(tool, name, parameters, handler)
  },
)
