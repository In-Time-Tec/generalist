import { Agent, AgentManifest, ExecutableManifest, Pins } from "@batonfx/core"
import type { Tool } from "effect/unstable/ai"

export const testExecutable = <Tools extends Record<string, Tool.Any>, R, P, A>(
  agent: Agent.Agent<Tools, R, P, A>,
  revision = "1",
): ExecutableManifest.PinnedExecutable & ExecutableManifest.ExecutableRef => {
  const pinned = pinnedTestExecutable(agent, revision)
  return { ...pinned, ...pinned.ref }
}

export const pinnedTestExecutable = <Tools extends Record<string, Tool.Any>, R, P, A>(
  agent: Agent.Agent<Tools, R, P, A>,
  revision = "1",
): ExecutableManifest.PinnedExecutable => {
  const pinned = pinnedTestAgent(agent, revision)
  return ExecutableManifest.make({ root: pinned.pin, agents: [pinned] })
}

export const pinnedTestAgent = <Tools extends Record<string, Tool.Any>, R, P, A>(
  agent: Agent.Agent<Tools, R, P, A>,
  revision = "1",
  children: ReadonlyArray<AgentManifest.ChildBinding> = [],
): AgentManifest.PinnedAgent =>
  AgentManifest.fromLiveAgent(agent, {
    model: Pins.makeModel({ test: agent.name, revision }),
    tools: Object.keys(agent.toolkit.tools).map((name) => ({
      name,
      pin: Pins.makeCapability({ test: agent.name, tool: name, revision }),
    })),
    skills: [],
    services: [],
    policy:
      agent.policy.snapshot === undefined
        ? { _tag: "Pinned", pin: Pins.makeCapability({ test: agent.name, policy: revision }) }
        : { _tag: "Portable", policy: agent.policy.snapshot },
    budget: agent.budget ?? {},
    children,
  })
