import { Agent, AgentManifest, ExecutableManifest, Pins } from "@batonfx/core"
import { Effect, Layer, Stream } from "effect"
import { LanguageModel, type Tool } from "effect/unstable/ai"

/** Model Layer for test Agents that are admitted and inspected but never reach a model call. */
export const unusedModel: Layer.Layer<LanguageModel.LanguageModel> = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.die(new Error("this test Agent must not call a model")),
    streamText: () => Stream.die(new Error("this test Agent must not call a model")),
  }),
)

/** Close one test Agent over a model it never calls. */
export const closedTestAgent = (agent: Agent.Agent): Agent.Closed => Agent.close(agent, unusedModel)

export const testExecutable: {
  <Tools extends Record<string, Tool.Any>, R, P, A>(
    agent: Agent.Agent<Tools, R, P, A>,
    revision?: string,
  ): ExecutableManifest.PinnedExecutable & ExecutableManifest.ExecutableRef
  <Tools extends Record<string, Tool.Any>, R, P, A>(
    revision?: string,
  ): (agent: Agent.Agent<Tools, R, P, A>) => ExecutableManifest.PinnedExecutable & ExecutableManifest.ExecutableRef
} = <Tools extends Record<string, Tool.Any>, R, P, A>(
  agentOrRevision?: Agent.Agent<Tools, R, P, A> | string,
  maybeRevision?: string,
): any => {
  if (agentOrRevision === undefined || typeof agentOrRevision === "string") {
    return (agent: Agent.Agent<Tools, R, P, A>) => testExecutable(agent, agentOrRevision)
  }
  const agent = agentOrRevision
  const revision = maybeRevision ?? "1"
  const pinned = pinnedTestExecutable(agent, revision)
  return { ...pinned, ...pinned.ref }
}

export const pinnedTestExecutable: {
  <Tools extends Record<string, Tool.Any>, R, P, A>(
    agent: Agent.Agent<Tools, R, P, A>,
    revision?: string,
  ): ExecutableManifest.PinnedExecutable
  <Tools extends Record<string, Tool.Any>, R, P, A>(
    revision?: string,
  ): (agent: Agent.Agent<Tools, R, P, A>) => ExecutableManifest.PinnedExecutable
} = <Tools extends Record<string, Tool.Any>, R, P, A>(
  agentOrRevision?: Agent.Agent<Tools, R, P, A> | string,
  maybeRevision?: string,
): any => {
  if (agentOrRevision === undefined || typeof agentOrRevision === "string") {
    return (agent: Agent.Agent<Tools, R, P, A>) => pinnedTestExecutable(agent, agentOrRevision)
  }
  const agent = agentOrRevision
  const revision = maybeRevision ?? "1"
  const pinned = pinnedTestAgent(agent, revision)
  return ExecutableManifest.make({ root: pinned.pin, entries: [{ _tag: "Agent", ...pinned }] })
}

export const pinnedTestAgent: {
  <Tools extends Record<string, Tool.Any>, R, P, A>(
    agent: Agent.Agent<Tools, R, P, A>,
    revision?: string,
    children?: ReadonlyArray<AgentManifest.ChildBinding>,
  ): AgentManifest.PinnedAgent
  <Tools extends Record<string, Tool.Any>, R, P, A>(
    revision?: string,
    children?: ReadonlyArray<AgentManifest.ChildBinding>,
  ): (agent: Agent.Agent<Tools, R, P, A>) => AgentManifest.PinnedAgent
} = <Tools extends Record<string, Tool.Any>, R, P, A>(
  agentOrRevision?: Agent.Agent<Tools, R, P, A> | string,
  maybeRevision?: string | ReadonlyArray<AgentManifest.ChildBinding>,
  maybeChildren?: ReadonlyArray<AgentManifest.ChildBinding>,
): any => {
  if (agentOrRevision === undefined || typeof agentOrRevision === "string") {
    const revision = agentOrRevision
    const children = maybeRevision as ReadonlyArray<AgentManifest.ChildBinding>
    return (agent: Agent.Agent<Tools, R, P, A>) => pinnedTestAgent(agent, revision, children)
  }
  const agent = agentOrRevision
  const revision = (maybeRevision as string | undefined) ?? "1"
  const children = maybeChildren ?? []
  return AgentManifest.fromLiveAgent(agent, {
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
}
