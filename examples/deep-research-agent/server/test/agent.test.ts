import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { Prompt } from "@batonfx/core"
import { agent } from "../src/agent"

describe("deep-research-agent definition", () => {
  it.effect("builds the stable demo agent shape", () =>
    Effect.gen(function* () {
      const continueDecision = yield* agent.policy.decide({
        turn: 6,
        history: Prompt.empty,
        pendingToolResults: [],
      })
      const stopDecision = yield* agent.policy.decide({
        turn: 7,
        history: Prompt.empty,
        pendingToolResults: [],
      })

      expect(agent.name).toBe("deep-research-agent")
      expect(agent.instructions).toBe(
        "Plan briefly, call web_search as needed, then synthesize a cited answer with source URLs.",
      )
      expect(Object.keys(agent.toolkit.tools)).toEqual(["web_search"])
      expect(continueDecision._tag).toBe("Continue")
      expect(stopDecision._tag).toBe("Stop")
    }),
  )
})
