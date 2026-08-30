import { Config, Layer } from "effect"
import { ModelRegistry } from "tenetkit"
import { OpenAIChatCompletions, OpenAIResponses } from "tenetkit/ai"
import { HttpClient } from "effect/unstable/http"

const responses = OpenAIResponses.layer({
  provider: "my-responses-endpoint",
  model: "reasoning-model",
  baseUrl: "https://models.example.com/v1",
  apiKey: Config.redacted("MODEL_API_KEY"),
  config: { max_output_tokens: 8_192 },
})

const chatCompletions = OpenAIChatCompletions.layer({
  provider: "my-chat-endpoint",
  model: "chat-model",
  baseUrl: "https://chat.example.com/v1",
  apiKey: Config.redacted("CHAT_API_KEY"),
  config: { max_tokens: 4_096 },
})

export const registryLayer: Layer.Layer<ModelRegistry.ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =
  ModelRegistry.layerMerged([responses, chatCompletions])

export const responsesSelection: ModelRegistry.ModelSelection = {
  provider: "my-responses-endpoint",
  model: "reasoning-model",
}

export const chatSelection: ModelRegistry.ModelSelection = {
  provider: "my-chat-endpoint",
  model: "chat-model",
}
