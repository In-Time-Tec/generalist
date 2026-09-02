import { Config, Console, Effect, Layer, ManagedRuntime, Schema } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { Agent } from "generalist"
import { layerClient, layerLanguageModel } from "generalist/ai/amazon-bedrock"
import { layerSupermemory } from "generalist/memory"

const input = Schema.Struct({ question: Schema.String })
const output = Schema.Struct({ answer: Schema.String })

const agent = Agent.make({
  name: "memory-example",
  instructions: "Answer from recalled memory when it is relevant.",
  input,
  output,
})

const key = { agent: "memory-example", subject: "user-ada" }

const program = Effect.gen(function* () {
  yield* Agent.run(
    agent,
    { question: "Remember that Ada's preferred editor theme is Solarized Dark." },
    {
      memory: { key },
    },
  )
  const recalled = yield* Agent.run(
    agent,
    { question: "Which editor theme does Ada prefer?" },
    {
      memory: { key },
    },
  )
  yield* Console.log(recalled.answer)
})

const model = layerLanguageModel({ model: "amazon.nova-micro-v1:0" }).pipe(Layer.provide(layerClient()))
const memory = layerSupermemory({
  apiKey: Config.redacted("SUPERMEMORY_API_KEY"),
  containerTag: key.subject,
}).pipe(Layer.provide(FetchHttpClient.layer))

const runtime = ManagedRuntime.make(Layer.merge(model, memory))
await runtime.runPromise(program)
