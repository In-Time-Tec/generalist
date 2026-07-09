import { Effect, Layer } from "effect"
import { LanguageModel } from "effect/unstable/ai"
import { Agent, Approvals, ModelMiddleware, ToolOutput } from "@batonfx/core"
import { docsToolLayer } from "./executor"
import { toolkit } from "./search-tool"

const agent = Agent.make({ name: "docs-assistant", toolkit })

export const run: Effect.Effect<Agent.Result, Agent.RunError, LanguageModel.LanguageModel> = Agent.generate(agent, {
  prompt: "Summarize every page that mentions layers.",
  toolOutputMaxBytes: 16_384,
}).pipe(
  Effect.provide(
    Layer.mergeAll(docsToolLayer, Approvals.autoApprove, ModelMiddleware.identityLayer, ToolOutput.layerMemory),
  ),
)
