import { Cause, Effect, Schema } from "effect"
import * as Ai from "effect/unstable/ai"
import * as Agent from "./agent"
import * as AgentEvent from "./agent-event"

const defaultParameters = Schema.Struct({ prompt: Schema.String })

type DefaultParameters = typeof defaultParameters
type DefaultSuccess = typeof Schema.String
type AgentToolTool<Name extends string, Parameters extends Schema.Top, Success extends Schema.Top> = Ai.Tool.Tool<
  Name,
  {
    readonly parameters: Parameters
    readonly success: Success
    readonly failure: typeof Schema.String
    readonly failureMode: "return"
  }
>

/** @experimental Options for exposing an agent as a handled Effect AI tool. */
export interface AsToolOptions<
  Parameters extends Schema.Top = DefaultParameters,
  Success extends Schema.Top = DefaultSuccess,
> {
  readonly name?: string
  readonly description?: string
  readonly parameters?: Parameters
  readonly success?: Success
  readonly toPrompt?: (params: Parameters["Type"]) => Ai.Prompt.RawInput
  readonly fromResult?: (result: Agent.Result) => Success["Type"]
}

/** @experimental A handled toolkit containing one child-agent tool. */
export type Toolkit = Ai.Toolkit.WithHandler<Record<string, Ai.Tool.Any>>

const errorMessage = (error: unknown): string => {
  if (error instanceof AgentEvent.AgentSuspended) {
    return `suspended on ${error.tool_name}: ${error.reason}`
  }
  if (error instanceof AgentEvent.AgentError) {
    return `failed on turn ${error.turn}: ${error.message}`
  }
  if (error instanceof AgentEvent.TurnLimitExceeded) {
    return `turn limit exceeded at turn ${error.turn}`
  }
  if (error instanceof AgentEvent.MiddlewareViolation) {
    return `middleware violation on turn ${error.turn}: ${error.detail}`
  }
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

const causeMessage = (agentName: string, cause: Cause.Cause<unknown>): string =>
  `sub-agent '${agentName}' could not complete: ${errorMessage(Cause.squash(cause))}`

const lazyHandled = <Name extends string, Parameters extends Schema.Top, Success extends Schema.Top>(
  toolkit: Ai.Toolkit.Toolkit<Record<Name, AgentToolTool<Name, Parameters, Success>>>,
  name: Name,
  handler: (params: Parameters["Type"]) => Effect.Effect<Success["Type"], string, Agent.RunServices>,
): Toolkit => ({
  tools: toolkit.tools as Record<string, Ai.Tool.Any>,
  handle: (toolName, params) =>
    toolkit.pipe(
      Effect.provide(
        toolkit.toLayer({
          [name]: handler,
        } as unknown as Ai.Toolkit.HandlersFrom<Record<Name, AgentToolTool<Name, Parameters, Success>>>),
      ),
      Effect.flatMap((handled) =>
        (handled as unknown as Ai.Toolkit.WithHandler<Record<string, Ai.Tool.Any>>).handle(toolName, params),
      ),
    ) as ReturnType<Toolkit["handle"]>,
})

/** @experimental Expose a same-process child agent as a failed-result-safe tool handler. */
export const asTool = <
  Tools extends Record<string, Ai.Tool.Any>,
  const Name extends string = string,
  Parameters extends Schema.Top = DefaultParameters,
  Success extends Schema.Top = DefaultSuccess,
>(
  agent: Agent.Agent<Tools>,
  options: AsToolOptions<Parameters, Success> = {},
): Toolkit => {
  const name = (options.name ?? agent.name) as Name
  const parameters = (options.parameters ?? defaultParameters) as Parameters
  const success = (options.success ?? Schema.String) as Success
  const toPrompt = (options.toPrompt ?? ((params: DefaultParameters["Type"]) => params.prompt)) as (
    params: Parameters["Type"],
  ) => Ai.Prompt.RawInput
  const fromResult = (options.fromResult ?? ((result: Agent.Result) => result.text)) as (
    result: Agent.Result,
  ) => Success["Type"]
  const tool = Ai.Tool.make(name, {
    ...(options.description === undefined ? {} : { description: options.description }),
    parameters,
    success,
    failure: Schema.String,
    failureMode: "return",
  }) as AgentToolTool<Name, Parameters, Success>
  const toolkit = Ai.Toolkit.make(tool) as unknown as Ai.Toolkit.Toolkit<
    Record<Name, AgentToolTool<Name, Parameters, Success>>
  >
  const handler = (params: Parameters["Type"]): Effect.Effect<Success["Type"], string, Agent.RunServices> =>
    Effect.gen(function* () {
      const prompt = yield* Effect.try({ try: () => toPrompt(params), catch: errorMessage })
      const result = yield* Agent.generate(agent, { prompt }).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterrupts(cause) ? Effect.interrupt : Effect.fail(causeMessage(agent.name, cause)),
        ),
      )
      return yield* Effect.try({ try: () => fromResult(result), catch: errorMessage })
    })
  return lazyHandled(toolkit, name, handler)
}
