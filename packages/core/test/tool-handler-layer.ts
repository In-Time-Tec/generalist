import { Effect, Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"

type ToolConfig = {
  readonly parameters: typeof Schema.Unknown
  readonly success: typeof Schema.Unknown
  readonly failure: typeof Schema.Never
  readonly failureMode: "error"
}

const names = [
  "ask_child",
  "ask_reviewer",
  "dynamic",
  "dynamic-gated",
  "echo",
  "failing-approval",
  "gated",
  "handled-context",
  "interruptible-approval",
  "lookup",
  "transfer_to_math",
  "throwing-approval",
  "wait",
  "waiting-approval",
] as const

const tools: ReadonlyArray<Tool.Tool<string, ToolConfig, never>> = names.map((name) =>
  Tool.make(name, {
    parameters: Schema.Unknown,
    success: Schema.Unknown,
  }),
)

const toolkit = Toolkit.make(...tools)

const handlers = Object.fromEntries(
  names.map((name) => [name, () => Effect.die(`Unexpected toolkit handler: ${name}`)]),
) as unknown as Toolkit.HandlersFrom<typeof toolkit.tools>

export const unusedToolHandlerLayer = toolkit.toLayer(handlers)
