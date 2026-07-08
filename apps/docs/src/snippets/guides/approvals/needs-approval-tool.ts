import { Schema } from "effect"
import * as Ai from "effect/unstable/ai"
import { Agent } from "@batonfx/core"

export const deployTool = Ai.Tool.make("deploy_service", {
  description: "Deploy a service to production",
  parameters: Schema.Struct({ service: Schema.String }),
  success: Schema.String,
  needsApproval: true,
})

export const agent = Agent.make({
  name: "release-agent",
  instructions: "Deploy services when asked, and wait for approval.",
  toolkit: Ai.Toolkit.make(deployTool),
})
