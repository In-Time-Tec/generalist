import { Effect, Layer, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import { Agent, AgentManifest, Pins } from "generalist"
import { Address, ExecutableManifest, ExecutableRegistration, ExecutableResolver } from "generalist/runtime"

const usage = Response.Usage.make({
  inputTokens: { uncached: undefined, total: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: undefined, text: undefined, reasoning: undefined },
})

const model = (onStream: () => void) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: () => {
        onStream()
        return Stream.make(
          Response.makePart("text-delta", { id: "text", delta: "actor response" }),
          Response.makePart("finish", { reason: "stop", usage, response: undefined }),
        )
      },
    }),
  )

const agent = Agent.make({ name: "raw-rivet-test" })
const pinned = AgentManifest.fromLiveAgent(agent, {
  model: Pins.makeModel({ provider: "test", model: "raw-rivet" }),
  tools: [],
  skills: [],
  services: [],
  policy:
    agent.policy.snapshot === undefined
      ? { _tag: "Pinned", pin: Pins.makeCapability({ policy: "test" }) }
      : { _tag: "Portable", policy: agent.policy.snapshot },
  budget: {},
  children: [],
})
const executable = ExecutableManifest.make({
  root: pinned.pin,
  entries: [{ _tag: "Agent", pin: pinned.pin, manifest: pinned.manifest }],
})

export const address = Address.make("agent:raw-rivet-test")
export const registrations = [...ExecutableRegistration.requiredPins(executable)].map((pin) => ({
  pin,
  codec: "test",
  version: "1",
  payload: {},
}))
export const addresses = [{ address, executable, registrations }]
export const makeResolverWithModel = (modelLayer: Layer.Layer<LanguageModel.LanguageModel>) =>
  ExecutableResolver.layerStatic([{ executable, agent: Agent.close(agent, modelLayer) }]).pipe(Layer.orDie)
export const makeResolver = (onStream: () => void = () => {}) => makeResolverWithModel(model(onStream))

let sequence = 0
export const partitionKey = (name: string) => [name, `${process.pid}-${++sequence}`]
