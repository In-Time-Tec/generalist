import { Agent, AgentManifest, ExecutableManifest, Pins } from "../../../src/index.js"
import { Effect, Layer, Schema, Stream } from "effect"
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

export function testExecutable<Tools extends Record<string, Tool.Any>, R, P, A>(
  agent: Agent.Agent<Tools, R, P, A>,
  revision?: string,
): ExecutableManifest.PinnedExecutable & ExecutableManifest.ExecutableRef
export function testExecutable<Tools extends Record<string, Tool.Any>, R, P, A>(
  revision?: string,
): (agent: Agent.Agent<Tools, R, P, A>) => ExecutableManifest.PinnedExecutable & ExecutableManifest.ExecutableRef
export function testExecutable<Tools extends Record<string, Tool.Any>, R, P, A>(
  agentOrRevision?: Agent.Agent<Tools, R, P, A> | string,
  maybeRevision?: string,
):
  | (ExecutableManifest.PinnedExecutable & ExecutableManifest.ExecutableRef)
  | ((agent: Agent.Agent<Tools, R, P, A>) => ExecutableManifest.PinnedExecutable & ExecutableManifest.ExecutableRef) {
  if (agentOrRevision === undefined || Schema.is(Schema.String)(agentOrRevision)) {
    return (agent) => testExecutable(agent, agentOrRevision)
  }
  const pinned = pinnedTestExecutable(agentOrRevision, maybeRevision ?? "1")
  return { ...pinned, ...pinned.ref }
}

export function pinnedTestExecutable<Tools extends Record<string, Tool.Any>, R, P, A>(
  agent: Agent.Agent<Tools, R, P, A>,
  revision?: string,
): ExecutableManifest.PinnedExecutable
export function pinnedTestExecutable<Tools extends Record<string, Tool.Any>, R, P, A>(
  revision?: string,
): (agent: Agent.Agent<Tools, R, P, A>) => ExecutableManifest.PinnedExecutable
export function pinnedTestExecutable<Tools extends Record<string, Tool.Any>, R, P, A>(
  agentOrRevision?: Agent.Agent<Tools, R, P, A> | string,
  maybeRevision?: string,
): ExecutableManifest.PinnedExecutable | ((agent: Agent.Agent<Tools, R, P, A>) => ExecutableManifest.PinnedExecutable) {
  if (agentOrRevision === undefined || Schema.is(Schema.String)(agentOrRevision)) {
    return (agent) => pinnedTestExecutable(agent, agentOrRevision)
  }
  const pinned = pinnedTestAgent(agentOrRevision, maybeRevision ?? "1")
  return ExecutableManifest.make({ root: pinned.pin, entries: [{ _tag: "Agent", ...pinned }] })
}

export function pinnedTestAgent<Tools extends Record<string, Tool.Any>, R, P, A>(
  agent: Agent.Agent<Tools, R, P, A>,
  revision?: string,
  children?: ReadonlyArray<AgentManifest.ChildSelection>,
): AgentManifest.PinnedAgent
export function pinnedTestAgent<Tools extends Record<string, Tool.Any>, R, P, A>(
  revision?: string,
  children?: ReadonlyArray<AgentManifest.ChildSelection>,
): (agent: Agent.Agent<Tools, R, P, A>) => AgentManifest.PinnedAgent
export function pinnedTestAgent<Tools extends Record<string, Tool.Any>, R, P, A>(
  agentOrRevision?: Agent.Agent<Tools, R, P, A> | string,
  maybeRevision?: string | ReadonlyArray<AgentManifest.ChildSelection>,
  maybeChildren?: ReadonlyArray<AgentManifest.ChildSelection>,
): AgentManifest.PinnedAgent | ((agent: Agent.Agent<Tools, R, P, A>) => AgentManifest.PinnedAgent) {
  if (agentOrRevision === undefined || Schema.is(Schema.String)(agentOrRevision)) {
    const revision = agentOrRevision
    const children =
      Schema.decodeUnknownSync(Schema.optional(Schema.Array(AgentManifest.ChildSelection)))(maybeRevision) ?? []
    return (agent) => pinnedTestAgent(agent, revision, children)
  }
  const agent = agentOrRevision
  const revision = Schema.decodeUnknownSync(Schema.optional(Schema.String))(maybeRevision) ?? "1"
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
