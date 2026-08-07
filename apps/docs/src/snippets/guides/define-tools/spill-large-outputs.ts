import { Effect, Layer } from "effect"
import { Agent, Approvals, LanguageModel, ModelMiddleware, ToolOutput } from "@batonfx/core"
import { docsToolLayer } from "./executor"
import { toolkit } from "./search-tool"

const agent = Agent.make({ name: "docs-assistant", toolkit })

export const run: Effect.Effect<Agent.Result, Agent.RunError, LanguageModel.LanguageModel> = Effect.scoped(
  Effect.flatMap(
    Layer.build(
      Layer.mergeAll(docsToolLayer, Approvals.layerAutoApprove, ModelMiddleware.layerIdentity, ToolOutput.layerMemory),
    ),
    (services) =>
      Agent.generate(agent, {
        prompt: "Summarize every page that mentions layers.",
        toolOutputMaxBytes: 16_384,
      }).pipe(Effect.provideContext(services)),
  ),
)
