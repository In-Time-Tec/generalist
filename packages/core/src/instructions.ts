import { Context, Effect, Layer, Option } from "effect"
import { dual } from "effect/Function"
import { AgentError } from "./agent-event.js"
/** @experimental Context available while rendering instruction sources. */
export interface RenderContext {
  readonly agentName: string
  readonly turn: number
}

/** @experimental Ordered source of model instructions or contextual updates. */
export interface ContextSource {
  readonly id: string
  readonly cache: "baseline" | "dynamic"
  readonly render: (context: RenderContext) => Effect.Effect<Option.Option<string>, AgentError>
}

/** @experimental Instructions registry service boundary. */
export interface Interface {
  readonly sources: ReadonlyArray<ContextSource>
}

/** @experimental */
export class Instructions extends Context.Service<Instructions, Interface>()("@batonfx/core/Instructions") {}

/** @experimental Frozen baseline plus compatibility-only dynamic sources. */
export interface ContextEpoch {
  readonly baseline: string
  readonly dynamic: ReadonlyArray<ContextSource>
}

/** @experimental A static baseline source. */
export const staticSource: {
  (text: string): (id: string) => ContextSource
  (id: string, text: string): ContextSource
} = dual(
  2,
  (id: string, text: string): ContextSource => ({
    id,
    cache: "baseline",
    render: () => Effect.succeed(text.length === 0 ? Option.none() : Option.some(text)),
  }),
)

/** @experimental Render baseline sources and freeze dynamic sources for an epoch. */
export const openEpoch: {
  (context: RenderContext): (instructions: Interface) => Effect.Effect<ContextEpoch, AgentError>
  (instructions: Interface, context: RenderContext): Effect.Effect<ContextEpoch, AgentError>
} = dual(
  2,
  (instructions: Interface, context: RenderContext): Effect.Effect<ContextEpoch, AgentError> =>
    Effect.gen(function* () {
      const baseline: Array<string> = []
      const dynamic: Array<ContextSource> = []

      for (const source of instructions.sources) {
        if (source.cache === "dynamic") {
          dynamic.push(source)
        } else {
          const rendered = yield* source.render(context)
          if (Option.isSome(rendered)) baseline.push(rendered.value)
        }
      }

      return { baseline: baseline.join("\n\n"), dynamic }
    }),
)

/**
 * @experimental Render dynamic sources for callers that own transcript insertion.
 * @deprecated Use `openEpoch` for Agent-integrated baseline instructions. Baton does not inject dynamic updates. Hosts needing changing context must own transcript insertion and persistence. This export will not be removed before 1.0.0 and only in a separately planned major release.
 */
export const renderUpdate: {
  (context: RenderContext): (epoch: ContextEpoch) => Effect.Effect<Option.Option<string>, AgentError>
  (epoch: ContextEpoch, context: RenderContext): Effect.Effect<Option.Option<string>, AgentError>
} = dual(
  2,
  (epoch: ContextEpoch, context: RenderContext): Effect.Effect<Option.Option<string>, AgentError> =>
    Effect.gen(function* () {
      const fragments: Array<string> = []

      for (const source of epoch.dynamic) {
        const rendered = yield* source.render(context)
        if (Option.isSome(rendered)) fragments.push(rendered.value)
      }

      return fragments.length === 0 ? Option.none() : Option.some(fragments.join("\n\n"))
    }),
)

/** @experimental Provide an explicit ordered instructions registry. */
export const layer = (sources: ReadonlyArray<ContextSource>): Layer.Layer<Instructions> =>
  Layer.succeed(Instructions, Instructions.of({ sources: [...sources] }))

/** @experimental */
export const testLayer = (implementation: Interface): Layer.Layer<Instructions> =>
  Layer.succeed(Instructions, Instructions.of(implementation))
