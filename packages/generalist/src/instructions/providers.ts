import { Context, Effect, Layer, Option } from "effect"
import { dual } from "effect/Function"
import { AgentError } from "../core/agent/event.js"
/** @experimental Context available while rendering instruction providers. */
export interface RenderContext {
  readonly agentName: string
  readonly turn: number
}

/** @experimental Ordered provider of model instructions or contextual updates. */
export interface Provider<R = never> {
  readonly id: string
  readonly render: (context: RenderContext) => Effect.Effect<Option.Option<string>, AgentError, R>
}

/** @experimental Instructions registry service boundary. */
export interface Service {
  readonly providers: ReadonlyArray<Provider>
}

/** @experimental */
export class Instructions extends Context.Service<Instructions, Service>()(
  "generalist/instructions/providers/Instructions",
) {}

/** @experimental A static baseline provider. */
export const fromText: {
  (text: string): (id: string) => Provider
  (id: string, text: string): Provider
} = dual(
  2,
  (id: string, text: string): Provider => ({
    id,
    render: () => Effect.succeed(text.length === 0 ? Option.none() : Option.some(text)),
  }),
)

/** @experimental Render every provider once for a run's instruction baseline. */
export const render: {
  (context: RenderContext): (instructions: Service) => Effect.Effect<string, AgentError>
  (instructions: Service, context: RenderContext): Effect.Effect<string, AgentError>
} = dual(
  2,
  (instructions: Service, context: RenderContext): Effect.Effect<string, AgentError> =>
    Effect.gen(function* () {
      const baseline: Array<string> = []
      for (const provider of instructions.providers) {
        const rendered = yield* provider.render(context)
        if (Option.isSome(rendered)) baseline.push(rendered.value)
      }
      return baseline.join("\n\n")
    }),
)

/** @experimental Provide an explicit ordered instructions registry. */
export const layer = <R>(providers: ReadonlyArray<Provider<R>>): Layer.Layer<Instructions, never, R> =>
  Layer.effect(
    Instructions,
    Effect.gen(function* () {
      const context = yield* Effect.context<R>()
      return Instructions.of({
        providers: providers.map((provider) => ({
          id: provider.id,
          render: (input) => provider.render(input).pipe(Effect.provideContext(context)),
        })),
      })
    }),
  )

/** @experimental */
export const layerTest = (implementation: Service): Layer.Layer<Instructions> =>
  Layer.succeed(Instructions, Instructions.of(implementation))
