import { BunRuntime } from "@effect/platform-bun"
import { Console, Effect, Layer } from "effect"
import { Agent, Compaction, Session } from "generalist"
import { layer, text } from "generalist/testing/model"

const coder = Agent.make({ name: "coding-agent" })
const services = Layer.mergeAll(
  Session.layerMemory,
  Compaction.layer({ contextWindow: 32_768, reserveTokens: 4_096, keepRecentTokens: 8_192 }),
  layer([text("The current goal is still to fix average([]).")]),
)

BunRuntime.runMain(
  Agent.run(coder, "Restate the current coding goal.", { sessionId: "fix-average" }).pipe(
    Effect.provide(services),
    Effect.flatMap(Console.log),
  ),
)
