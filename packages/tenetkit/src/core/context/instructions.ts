import { Context, Effect, Layer, Option } from "effect"
import { dual } from "effect/Function"
import { AgentError } from "../agent/event.js"
/** @experimental Context available while rendering instruction sources. */
export interface RenderContext {
  readonly agentName: string
  readonly turn: number
}

/** @experimental Ordered source of model instructions or contextual updates. */
export interface Source {
  readonly id: string
  readonly render: (context: RenderContext) => Effect.Effect<Option.Option<string>, AgentError>
}

/** @experimental Instructions registry service boundary. */
export interface Service {
  readonly sources: ReadonlyArray<Source>
}

/** @experimental */
export class Instructions extends Context.Service<Instructions, Service>()("tenetkit/core/context/instructions") {}

/** @experimental A static baseline source. */
export const staticSource: {
  (text: string): (id: string) => Source
  (id: string, text: string): Source
} = dual(
  2,
  (id: string, text: string): Source => ({
    id,
    render: () => Effect.succeed(text.length === 0 ? Option.none() : Option.some(text)),
  }),
)

/** @experimental Render every source once for a run's instruction baseline. */
export const openEpoch: {
  (context: RenderContext): (instructions: Service) => Effect.Effect<string, AgentError>
  (instructions: Service, context: RenderContext): Effect.Effect<string, AgentError>
} = dual(
  2,
  (instructions: Service, context: RenderContext): Effect.Effect<string, AgentError> =>
    Effect.gen(function* () {
      const baseline: Array<string> = []
      for (const source of instructions.sources) {
        const rendered = yield* source.render(context)
        if (Option.isSome(rendered)) baseline.push(rendered.value)
      }
      return baseline.join("\n\n")
    }),
)

/** @experimental Provide an explicit ordered instructions registry. */
export const layer = (sources: ReadonlyArray<Source>): Layer.Layer<Instructions> =>
  Layer.succeed(Instructions, Instructions.of({ sources: [...sources] }))

/** @experimental */
export const layerTest = (implementation: Service): Layer.Layer<Instructions> =>
  Layer.succeed(Instructions, Instructions.of(implementation))
