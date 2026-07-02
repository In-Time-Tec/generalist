import { ToolExecutor } from "@batonfx/core"
import { Effect, Layer } from "effect"
import * as Ai from "effect/unstable/ai"
import type * as McpToolSource from "./mcp-tool-source"

/**
 * Discovered MCP tools as a Baton toolkit. Pair with {@link toolExecutorLayer}
 * so tool calls are proxied to the MCP server instead of local handlers.
 *
 * @experimental
 */
export const toolkit = (
  source: McpToolSource.Interface,
): Effect.Effect<Ai.Toolkit.Toolkit<Record<string, Ai.Tool.Any>>> =>
  source.aiTools.pipe(
    Effect.map((tools) => Ai.Toolkit.make(...tools) as Ai.Toolkit.Toolkit<Record<string, Ai.Tool.Any>>),
  )

const failure = (message: string): ToolExecutor.Outcome => ({ _tag: "Failure", message })

const execute = (source: McpToolSource.Interface, request: ToolExecutor.Request): Effect.Effect<ToolExecutor.Outcome> =>
  source.tools.pipe(
    Effect.flatMap((tools) => {
      const tool = tools.find((candidate) => candidate.name === request.call.name)
      if (tool === undefined) {
        return Effect.succeed(failure(`Tool ${request.call.name} is not registered`))
      }
      return source.callTool(tool.rawName, request.call.params as McpToolSource.JsonValue).pipe(
        Effect.map((result): ToolExecutor.Outcome => ({ _tag: "Success", result, encodedResult: result })),
        Effect.catchTag("McpToolCallError", (error) => Effect.succeed(failure(error.message))),
      )
    }),
  )

/**
 * Baton `ToolExecutor` that proxies tool calls to the MCP server. Outcomes are
 * `Success` (from `callTool`) or `Failure` (from `McpToolCallError`) — MCP
 * tools never `Suspend`.
 *
 * @experimental
 */
export const toolExecutorLayer = (source: McpToolSource.Interface): Layer.Layer<ToolExecutor.ToolExecutor> =>
  Layer.succeed(
    ToolExecutor.ToolExecutor,
    ToolExecutor.ToolExecutor.of({
      execute: (request) => execute(source, request),
    }),
  )
