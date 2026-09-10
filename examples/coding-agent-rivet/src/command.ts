import type { CodingAgentConfig } from "./config.js"
import { codingLeadAddress } from "./executable.js"

export const codingTask = "Fix average([]) returning NaN in src/average.ts. Return 0 for empty input."

export const treePolicy = {
  maxDepth: 1,
  maxSessions: 3,
  concurrency: { agents: 2, tools: 2 },
} as const

export const make = (config: Pick<CodingAgentConfig, "tenant" | "partition">) => ({
  to: codingLeadAddress,
  sessionId: `coding:${config.tenant}:${config.partition}`,
  idempotencyKey: "fix-average-empty-v1",
  prompt: codingTask,
  treePolicy,
})
