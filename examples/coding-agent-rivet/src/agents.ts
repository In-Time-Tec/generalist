import { Toolkit } from "effect/unstable/ai"
import { Agent, AgentTool } from "generalist"
import { fixtureToolkit, readFile, runTests } from "./fixture.js"
import { specialistMessagingToolkit } from "./messaging.js"

const reviewerBudget = { tokens: 256, duration: 30_000, toolCalls: 2, children: 0 } as const
const testWriterBudget = { tokens: 256, duration: 30_000, toolCalls: 2, children: 0 } as const
const messagingTools = Object.values(specialistMessagingToolkit.tools)

export const reviewer = Agent.withTools(
  Agent.make({
    name: "reviewer",
    instructions: "Review the smallest safe fix and return one concise finding.",
    toolkit: Toolkit.make(readFile),
    budget: reviewerBudget,
  }),
  messagingTools,
)

export const testWriter = Agent.withTools(
  Agent.make({
    name: "test-writer",
    instructions: "Run the fixture tests and return the missing regression case.",
    toolkit: Toolkit.make(runTests),
    budget: testWriterBudget,
  }),
  messagingTools,
)

export const delegateSpecialists = AgentTool.fanOut({
  name: "delegate_specialists",
  description: "Ask the reviewer and test writer to inspect independent parts of the fix.",
  agents: {
    reviewer: {
      agent: reviewer,
      inherit: { history: "none", budget: reviewerBudget },
    },
    "test-writer": {
      agent: testWriter,
      inherit: { history: "none", budget: testWriterBudget },
    },
  },
  maxChildren: 2,
})

export const codingLead = Agent.withTools(
  Agent.make({
    name: "coding-lead",
    instructions:
      "Fix average([]) to return 0. Read the fixture, delegate review and test design, apply only the allowlisted patch, and run the tests.",
    toolkit: Toolkit.merge(fixtureToolkit, Toolkit.make(delegateSpecialists)),
    budget: { tokens: 2_048, duration: 120_000, toolCalls: 20, children: 2 },
  }),
  messagingTools,
)
