import { Schema } from "effect"
import { Agent, Tool, Toolkit } from "tenetkit"

export const deployTool = Tool.make("deploy_service", {
  description: "Deploy a service to production",
  parameters: Schema.Struct({ service: Schema.String }),
  success: Schema.String,
  needsApproval: true,
})

export const agent = Agent.make({
  name: "release-agent",
  instructions: "Deploy services when asked, and wait for approval.",
  toolkit: Toolkit.make(deployTool),
}) as unknown
