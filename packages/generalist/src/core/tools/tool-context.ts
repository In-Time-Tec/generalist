import { Context, Effect, Layer, Schema } from "effect"

/** A progress update emitted by a running tool. */
export interface Progress {
  readonly toolCallId: string
  readonly message?: string
  readonly data?: Schema.JsonObject
}

/** Ambient context available to a tool handler for the current call. */
export interface Service {
  readonly signal: AbortSignal
  readonly emit: (progress: Progress) => Effect.Effect<boolean>
  readonly sessionId: string
  readonly runId?: string
  readonly rootRunId?: string
  readonly toolCallId?: string
  readonly operationKey?: string
  readonly idempotencyKey?: string
  readonly attempt?: number
  readonly admittedAt?: string
  readonly deadline?: string
}
export class ToolContext extends Context.Service<ToolContext, Service>()(
  "generalist/core/tools/tool-context/ToolContext",
) {}
export const layerDefault: Layer.Layer<ToolContext> = Layer.sync(ToolContext, () =>
  ToolContext.of({
    signal: new AbortController().signal,
    emit: () => Effect.succeed(true),
    sessionId: "local",
  }),
)
export const layerTest = (implementation: Service): Layer.Layer<ToolContext> =>
  Layer.succeed(ToolContext, ToolContext.of(implementation))
