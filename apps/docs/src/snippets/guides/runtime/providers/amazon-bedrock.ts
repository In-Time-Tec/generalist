import { Layer } from "effect"
import { ModelRegistry } from "tenetkit"
import { AmazonBedrock } from "tenetkit/ai"

const model = "us.anthropic.claude-sonnet-4-20250514-v1:0"

export const registryLayer: Layer.Layer<ModelRegistry.ModelRegistry> = AmazonBedrock.layer({
  model,
  client: {
    region: "us-east-1",
    profile: "engineering",
  },
})

export const selection: ModelRegistry.ModelSelection = {
  provider: "amazon-bedrock",
  model,
}
