import { Schema } from "effect"
import { Agent, Tool, Toolkit } from "generalist"

export const deployTool = Tool.make("deploy_service", {
  description: "Deploy a service to production",
  parameters: Schema.Struct({ service: Schema.String }),
  success: Schema.String,
  needsApproval: true,
})

const _agent = Agent.make({
  name: "release-agent",
  instructions: "Deploy services when asked, and wait for approval.",
  toolkit: Toolkit.make(deployTool),
})
