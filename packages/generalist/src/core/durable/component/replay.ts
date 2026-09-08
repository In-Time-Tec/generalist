import { Context, Option } from "effect"
import type { Tool } from "effect/unstable/ai"
import type { ReplayPolicy } from "../driver/contract.js"
import { CommandTool } from "../component.js"

export const toolReplayPolicy = (input: {
  readonly tool: Tool.Any | undefined
  readonly fallback: ReplayPolicy | undefined
}): ReplayPolicy => {
  if (input.tool !== undefined && Option.isSome(Context.getOption(input.tool.annotations, CommandTool)))
    return "provider-idempotent"
  return input.fallback ?? "never"
}
