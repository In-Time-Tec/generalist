import { Layer, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import { Agent, AgentManifest, ExecutableManifest, Pins } from "generalist"
import { Address, ExecutableRegistration, ExecutableResolver } from "generalist/runtime"
import { codingLead, reviewer, testWriter } from "./agents.js"
import { agentServices } from "./services.js"

const revision = "1"
type PinnableAgent<Tools extends Record<string, Tool.Any>, R, P, A> = Agent.Agent<
  Tools,
  R,
  P,
  A,
  Schema.Top,
  Schema.Top
>

const pinAgent = <Tools extends Record<string, Tool.Any>, R, P, A>(
  agent: PinnableAgent<Tools, R, P, A>,
  children: ReadonlyArray<AgentManifest.ChildSelection> = [],
) =>
  AgentManifest.fromLiveAgent(agent, {
    model: Pins.makeModel({ example: "coding-agent-rivet", agent: agent.name, revision }),
    tools: Object.keys(agent.toolkit.tools).map((name) => ({
      name,
      pin: Pins.makeCapability({ example: "coding-agent-rivet", agent: agent.name, tool: name, revision }),
    })),
    skills: [],
    services: [],
    policy:
      agent.policy.snapshot === undefined
        ? {
            _tag: "Pinned",
            pin: Pins.makeCapability({ example: "coding-agent-rivet", agent: agent.name, policy: revision }),
          }
        : { _tag: "Portable", policy: agent.policy.snapshot },
    budget: agent.budget ?? {},
    children,
  })

const reviewerPinned = pinAgent(reviewer)
const testWriterPinned = pinAgent(testWriter)
const leadPinned = pinAgent(codingLead, [{ selection: "reviewer" }, { selection: "test-writer" }])
const entries = [leadPinned, reviewerPinned, testWriterPinned].map((pinned) => ({
  _tag: "Agent" as const,
  ...pinned,
}))
const profiles = [
  { selection: "reviewer", agent: reviewerPinned.pin },
  { selection: "test-writer", agent: testWriterPinned.pin },
]

export const codingLeadExecutable = ExecutableManifest.make({ root: leadPinned.pin, profiles, entries })
export const reviewerExecutable = ExecutableManifest.make({
  root: leadPinned.pin,
  active: reviewerPinned.pin,
  profiles,
  entries,
})
export const testWriterExecutable = ExecutableManifest.make({
  root: leadPinned.pin,
  active: testWriterPinned.pin,
  profiles,
  entries,
})

export const codingLeadAddress = Address.make("agent:coding-lead")
export const codingLeadRegistrations = [...ExecutableRegistration.requiredPins(codingLeadExecutable)].map((pin) => ({
  pin,
  codec: "coding-agent-rivet",
  version: revision,
  payload: { example: "coding-agent-rivet", revision, pin },
}))

export const addressBindings = [
  {
    address: codingLeadAddress,
    executable: codingLeadExecutable,
    registrations: codingLeadRegistrations,
  },
] as const

export const resolverLayer = ExecutableResolver.layerStatic([
  { executable: codingLeadExecutable, agent: Agent.close(codingLead, agentServices) },
  { executable: reviewerExecutable, agent: Agent.close(reviewer, agentServices) },
  { executable: testWriterExecutable, agent: Agent.close(testWriter, agentServices) },
]).pipe(Layer.orDie)
