import { Effect, Layer } from "effect"
import * as Ai from "effect/unstable/ai"
import { Agent, Approvals, Compaction, ModelMiddleware, ToolExecutor, ToolOutput } from "@batonfx/core"

const agent = Agent.make({ name: "long-running-assistant" })

const compactionLayer = Compaction.layer({
  contextWindow: 128_000,
  reserveTokens: 16_384,
  keepRecentTokens: 20_000,
})

export const run: Effect.Effect<Agent.Result, Agent.RunError, Ai.LanguageModel.LanguageModel> = Agent.generate(agent, {
  prompt: "Continue the migration plan.",
  compaction: { contextWindow: 128_000 },
  toolOutputMaxBytes: 16_384,
}).pipe(
  Effect.provide(
    Layer.mergeAll(
      ToolExecutor.testLayer({ execute: () => Effect.die("no tools in this example") }),
      Approvals.autoApprove,
      ModelMiddleware.identityLayer,
      compactionLayer,
      ToolOutput.layerMemory,
    ),
  ),
)
