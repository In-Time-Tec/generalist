import "./suites/dynamic-program-resolver-suite.js"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import { Agent, AgentManifest, ExecutableManifest, Pins } from "../../../src/index.js"
import { ExecutableResolver } from "../../../src/runtime/index.js"
import { closedTestAgent, pinnedTestExecutable, unusedModel } from "../run/identity.js"

describe("ExecutableResolver.makeStatic", () => {
  it.effect("resolves only a live Agent attested by the persisted active manifest", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "attested", budget: { modelCalls: 2 } })
      const executable = pinnedTestExecutable(agent)
      const resolver = ExecutableResolver.makeStatic([{ executable, agent: closedTestAgent(agent) }])

      const resolution = yield* resolver
        .resolve({ runId: "run:attested", ...executable, registrations: [] })
        .pipe(Effect.scoped)
      expect(resolution._tag).toBe("Agent")
      if (resolution._tag !== "Agent") return
      expect(resolution.agent.open((live) => Object.is(live, agent))).toBe(true)
      expect(resolution.attestation).toEqual(executable)
    }),
  )

  it("rejects a live Agent whose identity differs from the persisted manifest", () => {
    const persisted = Agent.make({ name: "agent", instructions: "persisted", budget: { modelCalls: 2 } })
    const executable = pinnedTestExecutable(persisted)

    expect(() =>
      ExecutableResolver.makeStatic([
        {
          executable,
          agent: closedTestAgent(Agent.make({ name: "agent", instructions: "different", budget: { modelCalls: 2 } })),
        },
      ]),
    ).toThrow(/does not match/)
    expect(() =>
      ExecutableResolver.makeStatic([
        { executable, agent: closedTestAgent(Agent.make({ name: "agent", instructions: "persisted" })) },
      ]),
    ).toThrow(/Budget must exactly match/)
    const unexpectedTool = Tool.make("unexpected", { parameters: Schema.Struct({}), success: Schema.Void })
    const withUnexpectedTool = Agent.make({
      name: "agent",
      instructions: "persisted",
      budget: { modelCalls: 2 },
      tools: [unexpectedTool],
    })
    expect(() =>
      ExecutableResolver.makeStatic([
        {
          executable,
          agent: Agent.close(
            withUnexpectedTool,
            Layer.merge(unusedModel, withUnexpectedTool.toolkit.toLayer({ unexpected: () => Effect.void })),
          ),
        },
      ]),
    ).toThrow(/Tool pins must exactly match/)
  })

  it("rejects duplicate static executable references", () => {
    const agent = Agent.make({ name: "duplicate" })
    const executable = pinnedTestExecutable(agent)
    expect(() =>
      ExecutableResolver.makeStatic([
        { executable, agent: closedTestAgent(agent) },
        { executable, agent: closedTestAgent(agent) },
      ]),
    ).toThrow(/Duplicate static executable reference/)
  })

  it("rejects missing or changed static compaction options", () => {
    const agent = Agent.make({ name: "compacting" })
    const compaction = {
      service: Pins.makeCapability({ service: "compaction" }),
      summaryModel: Pins.makeModel({ model: "summary" }),
      contextWindow: 32_000,
      reserveTokens: 2_000,
      keepRecentTokens: 8_000,
      strategyIdentity: "default:v1",
      summaryPromptIdentity: "summary:v1",
    }
    const pinned = AgentManifest.fromLiveAgent(agent, {
      model: Pins.makeModel({ model: "conversation" }),
      tools: [],
      skills: [],
      services: [],
      policy: { _tag: "Portable", policy: { _tag: "Forever" } },
      compaction,
      budget: {},
      children: [],
    })
    const executable = ExecutableManifest.make({ root: pinned.pin, entries: [{ _tag: "Agent", ...pinned }] })

    expect(() => ExecutableResolver.makeStatic([{ executable, agent: closedTestAgent(agent) }])).toThrow(
      /compaction options do not match/,
    )
    expect(() =>
      ExecutableResolver.makeStatic([
        {
          executable,
          agent: closedTestAgent(agent),
          runOptions: { compaction: { contextWindow: compaction.contextWindow, reserveTokens: 1_000 } },
        },
      ]),
    ).toThrow(/compaction options do not match/)
  })
})
