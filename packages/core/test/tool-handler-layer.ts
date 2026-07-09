import { Effect, Layer, Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"

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

const tools = names.map((name) =>
  Tool.make(name, {
    parameters: Schema.Unknown,
    success: Schema.Unknown,
  }),
)

const toolkit = Toolkit.make(...tools)

const handlers = Object.fromEntries(
  names.map((name) => [name, () => Effect.die(`Unexpected toolkit handler: ${name}`)]),
) as unknown as Toolkit.HandlersFrom<typeof toolkit.tools>

export const unusedToolHandlerLayer: Layer.Layer<Tool.Handler<any>> = toolkit.toLayer(handlers) as Layer.Layer<
  Tool.Handler<any>
>
