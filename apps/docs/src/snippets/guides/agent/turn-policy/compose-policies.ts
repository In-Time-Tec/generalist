import { Schema } from "effect"
import { Agent, Tool, Toolkit, Policy } from "generalist"

const submitAnswerTool = Tool.make("submit_answer", {
  description: "Submit the final answer",
  parameters: Schema.Struct({ answer: Schema.String }),
  success: Schema.String,
})

const _agent = Agent.make({
  name: "researcher",
  toolkit: Toolkit.make(submitAnswerTool),
  policy: Policy.both(Policy.recurs(4), Policy.untilToolCall("submit_answer")),
})
