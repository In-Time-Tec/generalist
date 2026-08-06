import { Prompt } from "effect/unstable/ai"
import { Agent, AgentEvent } from "@batonfx/core"
import { Address, ExecutableManifest, ExecutableRegistration, ExecutableResolver, Runtime } from "../src/index.js"
import { closedTestAgent, pinnedTestAgent } from "./identity.js"

/** Exact registration set covering every pin an executable requires. */
export const registrationsFor = (
  executable: ExecutableManifest.PinnedExecutable,
  suffix = "1",
): ReadonlyArray<ExecutableRegistration.ExecutableRegistration> =>
  [...ExecutableRegistration.requiredPins(executable)].map((pin) => ({
    pin,
    codec: "test",
    version: "1",
    payload: { fixture: suffix },
  }))

export const assistant: Agent.Agent = Agent.make({ name: "assistant" })
export const researcher: Agent.Agent = Agent.make({ name: "researcher" })
export const analyst: Agent.Agent = Agent.make({ name: "analyst" })

const analystPinned = pinnedTestAgent(analyst)
const researcherPinned = pinnedTestAgent(researcher, "1", [{ selection: "analyst", agent: analystPinned.pin }])
const assistantPinned = pinnedTestAgent(assistant, "1", [
  { selection: "analyst", agent: analystPinned.pin },
  { selection: "researcher", agent: researcherPinned.pin },
])
const entries = (...agents: ReadonlyArray<ReturnType<typeof pinnedTestAgent>>) =>
  agents.map((agent) => ({ _tag: "Agent" as const, pin: agent.pin, manifest: agent.manifest }))
const executable = ExecutableManifest.make({
  root: assistantPinned.pin,
  entries: entries(assistantPinned, researcherPinned, analystPinned),
})

export const assistantRef: ExecutableManifest.PinnedExecutable & ExecutableManifest.ExecutableRef = {
  ...executable,
  ...executable.ref,
}

const researcherExecutable = ExecutableManifest.make({
  root: assistantPinned.pin,
  active: researcherPinned.pin,
  entries: entries(assistantPinned, researcherPinned, analystPinned),
})
export const researcherRef: ExecutableManifest.PinnedExecutable & ExecutableManifest.ExecutableRef = {
  ...researcherExecutable,
  ...researcherExecutable.ref,
}

const analystExecutable = ExecutableManifest.make({
  root: assistantPinned.pin,
  active: analystPinned.pin,
  entries: entries(assistantPinned, researcherPinned, analystPinned),
})
export const analystRef: ExecutableManifest.PinnedExecutable & ExecutableManifest.ExecutableRef = {
  ...analystExecutable,
  ...analystExecutable.ref,
}

export const assistantAddress = Address.make("agent:assistant")
export const researcherAddress = Address.make("agent:researcher")

export const alternateAssistant: Agent.Agent = Agent.make({ name: "alternate-assistant" })
const alternateResearcher = Agent.make({ name: "alternate-researcher" })
const alternateResearcherPinned = pinnedTestAgent(alternateResearcher, "2")
const alternateAssistantPinned = pinnedTestAgent(alternateAssistant, "2", [
  { selection: "researcher", agent: alternateResearcherPinned.pin },
])
const alternateExecutable = ExecutableManifest.make({
  root: alternateAssistantPinned.pin,
  entries: entries(alternateAssistantPinned, alternateResearcherPinned),
})
export const alternateAssistantRef: ExecutableManifest.PinnedExecutable & ExecutableManifest.ExecutableRef = {
  ...alternateExecutable,
  ...alternateExecutable.ref,
}
const alternateResearcherExecutable = ExecutableManifest.make({
  root: alternateAssistantPinned.pin,
  active: alternateResearcherPinned.pin,
  entries: entries(alternateAssistantPinned, alternateResearcherPinned),
})
export const alternateResearcherRef: ExecutableManifest.PinnedExecutable & ExecutableManifest.ExecutableRef = {
  ...alternateResearcherExecutable,
  ...alternateResearcherExecutable.ref,
}
export const alternateAssistantAddress = Address.make("agent:alternate-assistant")

export const parentRelativeOptions: Runtime.LayerOptions = {
  resolver: ExecutableResolver.makeStatic([
    { executable: assistantRef, agent: closedTestAgent(assistant) },
    { executable: researcherRef, agent: closedTestAgent(researcher) },
    { executable: alternateAssistantRef, agent: closedTestAgent(alternateAssistant) },
    { executable: alternateResearcherRef, agent: closedTestAgent(alternateResearcher) },
  ]),
  addresses: [
    { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
    {
      address: alternateAssistantAddress,
      executable: alternateAssistantRef,
      registrations: registrationsFor(alternateAssistantRef),
    },
  ],
}

export const parentRelativeLayer = Runtime.layerMemory(parentRelativeOptions)

export const memoryLayer = Runtime.layerMemory({
  resolver: ExecutableResolver.makeStatic([
    { executable: assistantRef, agent: closedTestAgent(assistant) },
    { executable: researcherRef, agent: closedTestAgent(researcher) },
    { executable: analystRef, agent: closedTestAgent(analyst) },
  ]),
  addresses: [
    { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
    { address: researcherAddress, executable: researcherRef, registrations: registrationsFor(researcherRef) },
  ],
  subscriberQueueCapacity: 8,
})

export const lagLayer = Runtime.layerMemory({
  resolver: ExecutableResolver.makeStatic([{ executable: assistantRef, agent: closedTestAgent(assistant) }]),
  addresses: [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
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
  reason:
    reason === "approval"
      ? {
          _tag: "Approval" as const,
          request: { approvalId: waitId, operation: waitId, capability: "test", input: {} },
        }
      : reason === "tool-wait"
        ? { _tag: "ToolWait" as const }
        : reason === "signal"
          ? { _tag: "Signal" as const, name: waitId }
          : reason === "timer"
            ? { _tag: "Timer" as const }
            : { _tag: "External" as const },
  status: "open" as const,
  openedAt: "2026-08-03T00:00:00.000Z",
})

export const suspension = (waitId: string, reason: "tool-wait" | "approval" = "tool-wait"): AgentEvent.AgentSuspended =>
  AgentEvent.AgentSuspended.make({
    token: waitId,
    reason,
    tool_call_id: waitId,
    tool_name: "test",
    tool_params: {},
    tool_call_batch: [],
  })
