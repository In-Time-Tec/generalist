import { Schema } from "effect"
import { Agent, Tool, Toolkit, TurnPolicy } from "tenetkit"

const submitAnswerTool = Tool.make("submit_answer", {
  description: "Submit the final answer",
  parameters: Schema.Struct({ answer: Schema.String }),
  success: Schema.String,
})

export const agent = Agent.make({
  name: "researcher",
  toolkit: Toolkit.make(submitAnswerTool),
  policy: TurnPolicy.both(TurnPolicy.recurs(4), TurnPolicy.untilToolCall("submit_answer")),
}) as unknown
