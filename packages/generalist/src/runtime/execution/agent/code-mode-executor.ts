import { Context, Effect, Layer, Option, Schema } from "effect"
import type { Tool } from "effect/unstable/ai"
import type { Agent, ClosedServices } from "../../../core/agent/service.js"
import type { ToolContext } from "../../../core/tools/tool-context.js"
import { managedToolHandlers } from "../../../core/artifact.js"
import {
  type CancellationRequest,
  FrameworkFailure,
  type Outcome,
  type Request,
  type Service as ToolExecutorService,
  ToolExecutor,
  executeToolkit,
} from "../../../core/tools/tool-executor.js"
import { supportsCancellation } from "../../../core/tools/tool-executor-cancellation.js"
import { withoutFanOut } from "../../../core/agent/tool/fan-out.js"
import type { Service } from "../../code-mode/internal.js"

/** Route Runtime-owned Program tools while preserving the Agent's existing executor behavior. */
export const make = <
  Tools extends Record<string, Tool.Any>,
  R,
  InputSchema extends Schema.Top,
  OutputSchema extends Schema.Top,
>(options: {
  readonly agent: Agent<Tools, R, R, R, InputSchema, OutputSchema>
  readonly environment: Layer.Layer<ClosedServices<Tools, R, InputSchema, OutputSchema>>
  readonly implementation: Service
  readonly upstream: Option.Option<ToolExecutorService>
}): ToolExecutorService => {
  const upstream = Option.getOrUndefined(options.upstream)
  const background = new Set<string>(Object.values(options.implementation.backgroundTools).map((tool) => tool.name))
  const upstreamCancellation =
    upstream?.cancel !== undefined
      ? {
          cancellable: (request: Request) =>
            !background.has(request.call.name) &&
            request.call.name !== options.implementation.tool.name &&
            supportsCancellation(upstream, request),
          cancel: (request: CancellationRequest) => upstream.cancel!(request),
        }
      : {}
  const replayPolicy: ToolExecutorService["replayPolicy"] = (request) => {
    if (background.has(request.call.name)) return "provider-idempotent"
    if (request.call.name === options.implementation.tool.name) return "never"
    return Option.isSome(options.upstream) ? (options.upstream.value.replayPolicy?.(request) ?? "never") : "never"
  }
  const execute: ToolExecutorService["execute"] = (request) => {
    if (background.has(request.call.name)) return options.implementation.invokeBackground(request)
    if (request.call.name === options.implementation.tool.name) {
      return Schema.decodeUnknownEffect(options.implementation.parameters, { onExcessProperty: "error" })(
        request.call.params,
      ).pipe(
        Effect.flatMap((parameters) => options.implementation.invoke({ ...parameters, toolCallId: request.call.id })),
        Effect.mapError(() =>
          FrameworkFailure.make({
            stage: "decode-input",
            tool: options.implementation.tool.name,
            message: "code_mode input does not match its schema",
          }),
        ),
      )
    }
    if (Option.isSome(options.upstream)) return options.upstream.value.execute(request)
    const staticTool = options.agent.toolkit.tools[request.call.name]
    const handlers = staticTool === undefined ? undefined : managedToolHandlers(staticTool)
    const execution: unknown = Effect.flatMap(Effect.context<ToolContext>(), (context) =>
      Effect.scoped(
        Effect.flatMap(Layer.build(options.environment), (environment) =>
          executeToolkit(withoutFanOut(options.agent.toolkit), request).pipe(
            Effect.provideContext(handlers === undefined ? context : Context.merge(context, handlers)),
            Effect.provideContext(environment),
          ),
        ),
      ),
    )
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: the environment contains every unmanaged handler; a managed Artifact tool contributes its selected handler Context above.
    return execution as Effect.Effect<Outcome, FrameworkFailure, ToolContext>
  }
  return ToolExecutor.of({ replayPolicy, execute, ...upstreamCancellation })
}
