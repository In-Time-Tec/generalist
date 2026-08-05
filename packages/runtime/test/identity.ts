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
  return ExecutableManifest.make({ root: pinned.pin, entries: [{ _tag: "Agent", ...pinned }] })
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
