import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import { Agent } from "@batonfx/core"
import { ExecutableResolver } from "../src/index.js"
import { pinnedTestExecutable } from "./identity.js"

describe("ExecutableResolver.makeStatic", () => {
  it.effect("resolves only a live Agent attested by the persisted active manifest", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "attested", budget: { modelCalls: 2 } })
      const executable = pinnedTestExecutable(agent)
      const resolver = ExecutableResolver.makeStatic([{ executable, agent }])

      const resolution = yield* resolver.resolve({ runId: "run:attested", ...executable }).pipe(Effect.scoped)
      expect(resolution.agent).toBe(agent)
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
          agent: Agent.make({ name: "agent", instructions: "different", budget: { modelCalls: 2 } }),
        },
      ]),
    ).toThrow(/does not match/)
    expect(() =>
      ExecutableResolver.makeStatic([{ executable, agent: Agent.make({ name: "agent", instructions: "persisted" }) }]),
    ).toThrow(/Budget must exactly match/)
    expect(() =>
      ExecutableResolver.makeStatic([
        {
          executable,
          agent: Agent.make({
            name: "agent",
            instructions: "persisted",
            budget: { modelCalls: 2 },
            tools: [Tool.make("unexpected", { parameters: Schema.Struct({}) })],
          }),
        },
      ]),
    ).toThrow(/Tool pins must exactly match/)
  })

  it("rejects duplicate static executable references", () => {
    const agent = Agent.make({ name: "duplicate" })
    const executable = pinnedTestExecutable(agent)
    expect(() =>
      ExecutableResolver.makeStatic([
        { executable, agent },
        { executable, agent },
      ]),
    ).toThrow(/Duplicate static executable reference/)
  })
})
