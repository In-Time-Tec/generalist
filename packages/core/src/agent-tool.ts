import { Cause, Effect, Schema } from "effect"
import { Prompt, Tool, Toolkit } from "effect/unstable/ai"
import { type Agent, type Result, type RunServices, generate } from "./agent"
import { AgentError, AgentSuspended, MiddlewareViolation, TurnLimitExceeded } from "./agent-event"

const defaultParameters = Schema.Struct({ prompt: Schema.String })

type DefaultParameters = typeof defaultParameters
type DefaultSuccess = typeof Schema.String
type AgentToolTool<Name extends string, Parameters extends Schema.Top, Success extends Schema.Top> = Tool.Tool<
  Name,
  {
    readonly parameters: Parameters
    readonly success: Success
    readonly failure: typeof Schema.String
    readonly failureMode: "return"
  }
>

/** @experimental */
export interface AsToolOptions<
  Parameters extends Schema.Top = DefaultParameters,
  Success extends Schema.Top = DefaultSuccess,
> {
  readonly name?: string
  readonly description?: string
  readonly parameters?: Parameters
  readonly success?: Success
  readonly toPrompt?: (params: Parameters["Type"]) => Prompt.RawInput
  readonly fromResult?: (result: Result) => Success["Type"]
}

/** @experimental */
export type AgentToolToolkit = Toolkit.WithHandler<Record<string, Tool.Any>>

const errorMessage = (error: unknown): string => {
  if (error instanceof AgentSuspended) {
    return `suspended on ${error.tool_name}: ${error.reason}`
  }
  if (error instanceof AgentError) {
    return `failed on turn ${error.turn}: ${error.message}`
  }
  if (error instanceof TurnLimitExceeded) {
    return `turn limit exceeded at turn ${error.turn}`
  }
  if (error instanceof MiddlewareViolation) {
    return `middleware violation on turn ${error.turn}: ${error.detail}`
  }
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

const causeMessage = (agentName: string, cause: Cause.Cause<unknown>): string =>
  `sub-agent '${agentName}' could not complete: ${errorMessage(Cause.squash(cause))}`

const lazyHandled = <Name extends string, Parameters extends Schema.Top, Success extends Schema.Top>(
  toolkit: Toolkit.Toolkit<Record<Name, AgentToolTool<Name, Parameters, Success>>>,
  name: Name,
  handler: (
    params: Parameters["Type"],
  ) => Effect.Effect<Success["Type"], string, RunServices<Record<string, Tool.Any>, boolean>>,
): AgentToolToolkit => ({
  tools: toolkit.tools as Record<string, Tool.Any>,
  handle: (toolName, params) =>
    toolkit.pipe(
      Effect.provide(
        toolkit.toLayer({
          [name]: handler,
        } as unknown as Toolkit.HandlersFrom<Record<Name, AgentToolTool<Name, Parameters, Success>>>),
      ),
      Effect.flatMap((handled) =>
        (handled as unknown as Toolkit.WithHandler<Record<string, Tool.Any>>).handle(toolName, params),
      ),
    ) as ReturnType<AgentToolToolkit["handle"]>,
})

/** @experimental */
export const asTool = <
  Tools extends Record<string, Tool.Any>,
  HasModel extends boolean,
  const Name extends string = string,
  Parameters extends Schema.Top = DefaultParameters,
  Success extends Schema.Top = DefaultSuccess,
>(
  agent: Agent<Tools, HasModel>,
  options: AsToolOptions<Parameters, Success> = {},
): AgentToolToolkit => {
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
  }) as AgentToolTool<Name, Parameters, Success>
  const toolkit = Toolkit.make(tool) as unknown as Toolkit.Toolkit<
    Record<Name, AgentToolTool<Name, Parameters, Success>>
  >
  const handler = (params: Parameters["Type"]): Effect.Effect<Success["Type"], string, RunServices<Tools, HasModel>> =>
    Effect.gen(function* () {
      const prompt = yield* Effect.try({ try: () => toPrompt(params), catch: errorMessage })
      const result = yield* generate(agent, { prompt }).pipe(
        Effect.catchCause((cause) => {
          if (Cause.hasInterrupts(cause)) return Effect.interrupt
          const error = Cause.squash(cause)
          if (error instanceof AgentSuspended) return Effect.die(error)
          return Effect.fail(causeMessage(agent.name, cause))
        }),
      )
      return yield* Effect.try({ try: () => fromResult(result), catch: errorMessage })
    })
  return lazyHandled(toolkit, name, handler)
}
