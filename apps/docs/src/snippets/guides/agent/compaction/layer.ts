import { Effect, Layer } from "effect"
import {
  Agent,
  Approvals,
  Compaction,
  LanguageModel,
  ModelMiddleware,
  Permissions,
  ToolExecutor,
  ToolOutput,
} from "generalist"

const agent = Agent.make({ name: "long-running-assistant" })

const compactionLayer = Compaction.layer({
  contextWindow: 128_000,
  reserveTokens: 16_384,
  strategy: Compaction.strategy([
    Compaction.toolOutputBound({ maxBytes: 16_384 }),
    Compaction.structuredSummary({ objectName: "AgentSummary" }),
    Compaction.keepRecent({ tokens: 20_000 }),
  ]),
})

export const run: Effect.Effect<Agent.Result, Agent.RunError, LanguageModel.LanguageModel> = Effect.scoped(
  Effect.flatMap(
    Layer.build(
      Layer.mergeAll(
        ToolExecutor.layerTest({ execute: () => Effect.die("no tools in this example") }),
        Permissions.layerAllowAll,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        compactionLayer,
        ToolOutput.layerMemory,
      ),
    ),
    (services) =>
      Agent.generate(agent, {
        prompt: "Continue the migration plan.",
        compaction: { contextWindow: 128_000 },
      }).pipe(Effect.provideContext(services)),
  ),
)
