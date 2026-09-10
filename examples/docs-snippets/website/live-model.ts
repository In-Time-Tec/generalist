import { BunRuntime } from "@effect/platform-bun"
import { Config, Console, Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { Agent } from "generalist"
import { layerConfig, layerModel } from "generalist/providers/openai"

const coder = Agent.make({
  name: "coding-agent",
  instructions: "Explain the bug. Propose a minimal fix and a regression test. Do not claim to have edited files.",
})

const model = layerModel({ model: "gpt-4o-mini" }).pipe(
  Layer.provide(layerConfig({ apiKey: Config.Redacted("OPENAI_API_KEY") })),
  Layer.provide(FetchHttpClient.layer),
)

BunRuntime.runMain(
  Effect.gen(function* () {
    const answer = yield* Agent.run(
      coder,
      "Why does values.reduce((sum, n) => sum + n, 0) / values.length return NaN for an empty array?",
    ).pipe(Effect.provide(model))
    yield* Console.log(answer)
  }),
)
