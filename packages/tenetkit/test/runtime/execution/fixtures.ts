import { Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Agent, AgentEvent, AgentManifest } from "../../../src/index.js"
import {
  Address,
  ExecutableManifest,
  ExecutableRegistration,
  ExecutableResolver,
  RunWait,
  Runtime,
} from "../../../src/runtime/index.js"
import { closedTestAgent, pinnedTestAgent } from "../run/identity.js"

/** Exact registration set covering every pin an executable requires. */
export function registrationsFor(
  suffix?: string,
): (executable: ExecutableManifest.PinnedExecutable) => ReadonlyArray<ExecutableRegistration.ExecutableRegistration>
export function registrationsFor(
  executable: ExecutableManifest.PinnedExecutable,
  suffix?: string,
): ReadonlyArray<ExecutableRegistration.ExecutableRegistration>
export function registrationsFor(
  executableOrSuffix?: ExecutableManifest.PinnedExecutable | string,
  maybeSuffix?: string,
):
  | ReadonlyArray<ExecutableRegistration.ExecutableRegistration>
  | ((
      executable: ExecutableManifest.PinnedExecutable,
    ) => ReadonlyArray<ExecutableRegistration.ExecutableRegistration>) {
  if (executableOrSuffix === undefined) return (executable) => registrationsFor(executable)
  if (Schema.is(Schema.String)(executableOrSuffix)) {
    return (executable) => registrationsFor(executable, executableOrSuffix)
  }
  const suffix = maybeSuffix ?? "1"
  return [...ExecutableRegistration.requiredPins(executableOrSuffix)].map((pin) => ({
    pin,
    codec: "test",
    version: "1",
    payload: { fixture: suffix },
  }))
}

export const assistant: Agent.Agent = Agent.make({ name: "assistant" })
export const researcher: Agent.Agent = Agent.make({ name: "researcher" })
export const analyst: Agent.Agent = Agent.make({ name: "analyst" })

const recursiveProfiles = [{ selection: "analyst" }, { selection: "researcher" }]
const analystPinned = pinnedTestAgent(analyst, "1", recursiveProfiles)
const researcherPinned = pinnedTestAgent(researcher, "1", recursiveProfiles)
export const researcherPin = researcherPinned.pin
const assistantPinned = pinnedTestAgent(assistant, "1", [{ selection: "analyst" }, { selection: "researcher" }])
const entries = (...agents: ReadonlyArray<AgentManifest.PinnedAgent>) =>
  agents.map((agent) => ({ _tag: "Agent" as const, pin: agent.pin, manifest: agent.manifest }))
const executable = ExecutableManifest.make({
  root: assistantPinned.pin,
  profiles: [
    { selection: "analyst", agent: analystPinned.pin },
    { selection: "researcher", agent: researcherPinned.pin },
  ],
  entries: entries(assistantPinned, researcherPinned, analystPinned),
})

export const assistantRef = executable

const researcherExecutable = ExecutableManifest.make({
  root: assistantPinned.pin,
  active: researcherPinned.pin,
  profiles: executable.manifest.profiles,
  entries: entries(assistantPinned, researcherPinned, analystPinned),
})
export const researcherRef = researcherExecutable

const analystExecutable = ExecutableManifest.make({
  root: assistantPinned.pin,
  active: analystPinned.pin,
  profiles: executable.manifest.profiles,
  entries: entries(assistantPinned, researcherPinned, analystPinned),
})
export const analystRef = analystExecutable

export const assistantAddress = Address.make("agent:assistant")
export const researcherAddress = Address.make("agent:researcher")

export const alternateAssistant: Agent.Agent = Agent.make({ name: "alternate-assistant" })
const alternateResearcher = Agent.make({ name: "alternate-researcher" })
const alternateResearcherPinned = pinnedTestAgent(alternateResearcher, "2")
const alternateAssistantPinned = pinnedTestAgent(alternateAssistant, "2", [{ selection: "researcher" }])
const alternateExecutable = ExecutableManifest.make({
  root: alternateAssistantPinned.pin,
  profiles: [{ selection: "researcher", agent: alternateResearcherPinned.pin }],
  entries: entries(alternateAssistantPinned, alternateResearcherPinned),
})
export const alternateAssistantRef = alternateExecutable
const alternateResearcherExecutable = ExecutableManifest.make({
  root: alternateAssistantPinned.pin,
  active: alternateResearcherPinned.pin,
  profiles: alternateExecutable.manifest.profiles,
  entries: entries(alternateAssistantPinned, alternateResearcherPinned),
})
export const alternateResearcherRef = alternateResearcherExecutable
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
  session: { sessionId: "test-session", leafId: null },
})

type OpenWait = RunWait.RunWait

type OpenWaitReason = "tool-wait" | "approval" | "signal" | "timer" | "external"

export interface OpenWaitOptions {
  readonly waitId: string
  readonly reason?: OpenWaitReason
}

export const openWait = (options: OpenWaitOptions): OpenWait => {
  const waitId = options.waitId
  const reason = options.reason ?? "tool-wait"
  let reasonValue: OpenWait["reason"]
  if (reason === "approval") {
    reasonValue = {
      _tag: "Approval",
      request: { approvalId: waitId, operation: waitId, capability: "test", input: {} },
    }
  } else if (reason === "tool-wait") reasonValue = { _tag: "ToolWait" }
  else if (reason === "signal") reasonValue = { _tag: "Signal", name: waitId }
  else if (reason === "timer") reasonValue = { _tag: "Timer" }
  else reasonValue = { _tag: "External" }
  return {
    waitId,
    reason: reasonValue,
    status: "open" as const,
    openedAt: "2026-08-03T00:00:00.000Z",
  }
}

export interface SuspensionOptions {
  readonly waitId: string
  readonly reason?: "tool-wait" | "approval"
  readonly token?: string
  readonly toolCallId?: string
  readonly toolName?: string
  readonly toolParams?: unknown
  readonly operationKey?: string
}

export const suspension = (options: SuspensionOptions): AgentEvent.AgentSuspended => {
  const reason = options.reason ?? "tool-wait"
  const token = options.token ?? options.waitId
  const call = {
    type: "tool-call" as const,
    id: options.toolCallId ?? options.waitId,
    name: options.toolName ?? "test",
    params: options.toolParams ?? {},
    providerExecuted: false,
    metadata: {},
  }
  return AgentEvent.AgentSuspended.make({
    checkpoint: {
      turn: 0,
      calls: [
        {
          call,
          operationKey: options.operationKey ?? `test:${options.waitId}`,
          state: { _tag: "Waiting", reason, waitId: options.waitId, token },
        },
      ],
      activeTools: [call.name],
      authorizationContextDigest: "",
      activatedSkills: [],
      invocationPath: [],
    },
    waits: [{ waitId: options.waitId, token, reason, callIndex: 0, call }],
  })
}
