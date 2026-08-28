import { Context, Effect, Layer, Option } from "effect"
import { dual } from "effect/Function"
import { AgentError } from "../agent/event.js"
/** @experimental Context available while rendering instruction sources. */
export interface RenderContext {
  readonly agentName: string
  readonly turn: number
}

/** @experimental Ordered source of model instructions or contextual updates. */
export interface ContextSource {
  readonly id: string
  readonly render: (context: RenderContext) => Effect.Effect<Option.Option<string>, AgentError>
}

/** @experimental Instructions registry service boundary. */
export interface Interface {
  readonly sources: ReadonlyArray<ContextSource>
}

/** @experimental */
export class Instructions extends Context.Service<Instructions, Interface>()("tenetkit/core/context/instructions") {}

/** @experimental A static baseline source. */
export const staticSource: {
  (text: string): (id: string) => ContextSource
  (id: string, text: string): ContextSource
} = dual(
  2,
  (id: string, text: string): ContextSource => ({
    id,
    render: () => Effect.succeed(text.length === 0 ? Option.none() : Option.some(text)),
  }),
)

/** @experimental Render every source once for a run's instruction baseline. */
export const openEpoch: {
  (context: RenderContext): (instructions: Interface) => Effect.Effect<string, AgentError>
  (instructions: Interface, context: RenderContext): Effect.Effect<string, AgentError>
} = dual(
  2,
  (instructions: Interface, context: RenderContext): Effect.Effect<string, AgentError> =>
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
export const layer = (sources: ReadonlyArray<ContextSource>): Layer.Layer<Instructions> =>
  Layer.succeed(Instructions, Instructions.of({ sources: [...sources] }))

/** @experimental */
export const layerTest = (implementation: Interface): Layer.Layer<Instructions> =>
  Layer.succeed(Instructions, Instructions.of(implementation))
