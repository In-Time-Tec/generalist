import { Cause, Effect, Function, Schema } from "effect"
import { Prompt, Tool, Toolkit } from "effect/unstable/ai"
import { type Agent, type Result, type RunServices, generate } from "./agent.js"
import { AgentError, AgentSuspended, MiddlewareViolation, TurnLimitExceeded } from "./agent-event.js"

const defaultParameters = Schema.Struct({ prompt: Schema.String })

type DefaultParameters = typeof defaultParameters
type DefaultSuccess = typeof Schema.String
type AgentToolTool<Name extends string, Parameters extends Schema.Top, Success extends Schema.Top, R> = Tool.Tool<
  Name,
  {
    readonly parameters: Parameters
    readonly success: Success
    readonly failure: typeof Schema.String
    readonly failureMode: "return"
  },
  R
>

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

/** @experimental */
export type AgentToolToolkit<
  Name extends string,
  Parameters extends Schema.Top,
  Success extends Schema.Top,
  R,
> = Toolkit.WithHandler<Record<Name, AgentToolTool<Name, Parameters, Success, R>>>

const errorMessage = (error: unknown): string => {
  if (Schema.is(AgentSuspended)(error)) {
    return `suspended on ${error.tool_name}: ${error.reason}`
  }
  if (Schema.is(AgentError)(error)) {
    return `failed on turn ${error.turn}: ${error.message}`
  }
  if (Schema.is(TurnLimitExceeded)(error)) {
    return `turn limit exceeded at turn ${error.turn}`
  }
  if (Schema.is(MiddlewareViolation)(error)) {
    return `middleware violation on turn ${error.turn}: ${error.detail}`
  }
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

const causeMessage = (agentName: string, cause: Cause.Cause<unknown>): string =>
  `sub-agent '${agentName}' could not complete: ${errorMessage(Cause.squash(cause))}`

const lazyHandled = <Name extends string, Parameters extends Schema.Top, Success extends Schema.Top, R>(
  toolkit: Toolkit.Toolkit<Record<Name, AgentToolTool<Name, Parameters, Success, R>>>,
  name: Name,
  handler: (params: Parameters["Type"]) => Effect.Effect<Success["Type"], string, R>,
): AgentToolToolkit<Name, Parameters, Success, R> => ({
  tools: toolkit.tools,
  handle: (toolName, params) =>
    toolkit
      .toHandlers({
        [name]: handler,
      } as unknown as Toolkit.HandlersFrom<Record<Name, AgentToolTool<Name, Parameters, Success, R>>>)
      .pipe(
        Effect.flatMap((handlers) => toolkit.pipe(Effect.provide(handlers))),
        Effect.flatMap((handled) => handled.handle(toolName, params)),
      ),
})

/** @experimental */
export const asTool: {
  <
    const Name extends string = string,
    Parameters extends Schema.Top = DefaultParameters,
    Success extends Schema.Top = DefaultSuccess,
  >(
    options?: AsToolOptions<Name, Parameters, Success>,
  ): <Tools extends Record<string, Tool.Any>, HasModel extends boolean>(
    agent: Agent<Tools, HasModel>,
  ) => AgentToolToolkit<Name, Parameters, Success, RunServices<Tools, HasModel>>
  <
    Tools extends Record<string, Tool.Any>,
    HasModel extends boolean,
    const Name extends string = string,
    Parameters extends Schema.Top = DefaultParameters,
    Success extends Schema.Top = DefaultSuccess,
  >(
    agent: Agent<Tools, HasModel>,
    options?: AsToolOptions<Name, Parameters, Success>,
  ): AgentToolToolkit<Name, Parameters, Success, RunServices<Tools, HasModel>>
} = Function.dual(
  (args) => args.length !== 1 || "name" in args[0],
  <
    Tools extends Record<string, Tool.Any>,
    HasModel extends boolean,
    const Name extends string = string,
    Parameters extends Schema.Top = DefaultParameters,
    Success extends Schema.Top = DefaultSuccess,
  >(
    agent: Agent<Tools, HasModel>,
    options: AsToolOptions<Name, Parameters, Success> = {},
  ): AgentToolToolkit<Name, Parameters, Success, RunServices<Tools, HasModel>> => {
    const name = (options.name ?? agent.name) as Name
    const parameters = (options.parameters ?? defaultParameters) as Parameters
    const success = (options.success ?? Schema.String) as Success
    const toPrompt = (options.toPrompt ?? ((params: DefaultParameters["Type"]) => params.prompt)) as (
      params: Parameters["Type"],
    ) => Prompt.RawInput
    const fromResult = (options.fromResult ?? ((result: Result) => result.text)) as (result: Result) => Success["Type"]
    const tool = Tool.make(name, {
      ...(options.description === undefined ? {} : { description: options.description }),
      parameters,
      success,
      failure: Schema.String,
      failureMode: "return",
    }) as AgentToolTool<Name, Parameters, Success, RunServices<Tools, HasModel>>
    const toolkit = Toolkit.make(tool) as unknown as Toolkit.Toolkit<
      Record<Name, AgentToolTool<Name, Parameters, Success, RunServices<Tools, HasModel>>>
    >
    const handler = (
      params: Parameters["Type"],
    ): Effect.Effect<Success["Type"], string, RunServices<Tools, HasModel>> =>
      Effect.gen(function* () {
        const prompt = yield* Effect.try({ try: () => toPrompt(params), catch: errorMessage })
        const result = yield* generate(agent, { prompt }).pipe(
          Effect.catchCause((cause) => {
            if (Cause.hasInterrupts(cause)) return Effect.interrupt
            return Effect.fail(causeMessage(agent.name, cause))
          }),
        )
        return yield* Effect.try({ try: () => fromResult(result), catch: errorMessage })
      })
    return lazyHandled(toolkit, name, handler)
  },
)
