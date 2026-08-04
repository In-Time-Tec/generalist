import { Prompt } from "effect/unstable/ai"
import { Agent } from "@batonfx/core"
import { Address, AgentRef, Runtime } from "../src/index.js"

export const assistant: Agent.Agent = Agent.make({ name: "assistant" })
export const researcher: Agent.Agent = Agent.make({ name: "researcher" })

export const assistantRef = AgentRef.make({
  id: "assistant",
  version: "1",
  digest: "sha256:assistant",
})

export const researcherRef = AgentRef.make({
  id: "researcher",
  version: "1",
  digest: "sha256:researcher",
})

export const assistantAddress = Address.make("agent:assistant")
export const researcherAddress = Address.make("agent:researcher")

export const memoryLayer = Runtime.layerMemory({
  agents: [
    { ref: assistantRef, agent: assistant },
    { ref: researcherRef, agent: researcher },
  ],
  addresses: [
    { address: assistantAddress, agent: assistantRef },
    { address: researcherAddress, agent: researcherRef },
  ],
  subscriberQueueCapacity: 8,
})

export const lagLayer = Runtime.layerMemory({
  agents: [{ ref: assistantRef, agent: assistant }],
  addresses: [{ address: assistantAddress, agent: assistantRef }],
  subscriberQueueCapacity: 1,
})

export const textPrompt = (text: string) => Prompt.make(text)

export const emptyTranscript = Prompt.fromMessages([])

export const completedResult = (text: string) => ({
  text,
  turns: 1,
  transcript: emptyTranscript,
})

export const openWait = (
  waitId: string,
  reason: "tool-wait" | "approval" | "signal" | "timer" | "external" = "tool-wait",
) => ({
  waitId,
  reason,
  status: "open" as const,
  openedAt: "2026-08-03T00:00:00.000Z",
})
