import { Context, Effect, Layer } from "effect"

/** @experimental A progress update emitted by a running tool. */
export interface Progress {
  readonly toolCallId: string
  readonly message?: string
  readonly data?: Record<string, unknown>
}

/** @experimental Ambient context available to a tool handler for the current call. */
export interface Interface {
  readonly signal: AbortSignal
  readonly emit: (progress: Progress) => Effect.Effect<void>
  readonly sessionId: string
}

/** @experimental */
export class ToolContext extends Context.Service<ToolContext, Interface>()("@batonfx/core/tool-context/ToolContext") {}

/** @experimental */
export const layerDefault: Layer.Layer<ToolContext> = Layer.sync(ToolContext, () =>
  ToolContext.of({
    signal: new AbortController().signal,
    emit: () => Effect.void,
    sessionId: "local",
  }),
)

/** @experimental */
export const testLayer = (implementation: Interface): Layer.Layer<ToolContext> =>
  Layer.succeed(ToolContext, ToolContext.of(implementation))
