import { Context, Effect, Layer, Option } from "effect"
import { Prompt, Response, Tool } from "effect/unstable/ai"
import { AgentError } from "../agent/event.js"
/** Typed operation-level adapter for LanguageModel.Service wrappers. */
export { adapt } from "./service.js"
/** Turn-scoped info handed to middleware. */
export interface TurnContext {
  readonly agentName: string
  readonly turn: number
}

/** A single middleware. Both hooks are optional; omitted hooks are identity. */
export interface Middleware {
  /** Transform the prompt for a turn before it is sent to the model. Recalled-memory messages must preserve lineage. */
  readonly transformPrompt?: (prompt: Prompt.Prompt, context: TurnContext) => Effect.Effect<Prompt.Prompt, AgentError>
  /**
   * Transform or drop a model stream part before the loop processes it.
   * Return `Option.none()` to drop the part (it is not folded, not emitted, not persisted).
   * Tool-call parts may be transformed but MUST NOT be dropped — dropping a tool-call
   * is a middleware bug; the loop fails the run with MiddlewareViolation if it happens.
   */
  readonly transformPart?: (
    part: Response.StreamPart<Record<string, Tool.Any>>,
    context: TurnContext,
  ) => Effect.Effect<Option.Option<Response.StreamPart<Record<string, Tool.Any>>>, AgentError>
}

/** Service holding the middleware chain, applied in array order. */
export class ModelMiddleware extends Context.Service<ModelMiddleware, ReadonlyArray<Middleware>>()(
  "generalist/core/model/middleware/ModelMiddleware",
) {}

/** Identity chain — the default. */
export const layerIdentity: Layer.Layer<ModelMiddleware> = Layer.succeed(ModelMiddleware, [])

/** Provide an explicit chain. */
export const layer = (middleware: ReadonlyArray<Middleware>): Layer.Layer<ModelMiddleware> =>
  Layer.succeed(ModelMiddleware, middleware)
