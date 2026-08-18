import { Schema } from "effect"
import { Tool } from "effect/unstable/ai"

export const skillListingBudgetTokens = 2_048

export const activateSkillToolName = "activate_skill"

export const activateSkillParameters = Schema.Struct({ name: Schema.String })

export const activateSkillSuccess = Schema.Struct({
  name: Schema.String,
  body: Schema.String,
  allowedTools: Schema.Array(Schema.String),
})

export const activateSkillFailure = Schema.Struct({
  reason: Schema.Literals(["not-found", "not-model-invocable"]),
  message: Schema.String,
})

export const activateSkillTool = Tool.make(activateSkillToolName, {
  description: "Load the full body for one listed TenetKit skill by name before applying that skill.",
  parameters: activateSkillParameters,
  success: activateSkillSuccess,
  failure: activateSkillFailure,
  failureMode: "return",
})
