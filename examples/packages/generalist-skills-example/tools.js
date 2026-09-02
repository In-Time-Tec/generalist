import { Effect, Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"

const packageEcho = Tool.make("package_echo", {
  description: "Echo text through the reference package",
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.String,
})

export const toolkit = Toolkit.make(packageEcho)

export const handlers = {
  package_echo: ({ text }) => Effect.succeed(text),
}

export const handlerLayer = toolkit.toLayer(handlers)
