import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { Response } from "effect/unstable/ai"
import { Permissions } from "../src/index"
import { ItLayer } from "./it-layer"

const request = {
  call: Response.makePart("tool-call", { id: "one", name: "bash", params: { command: "ls" }, providerExecuted: false }),
  agentName: "agent",
  turn: 1,
}

describe("Permissions", () => {
  it("matches tool names and projected parameter globs", () => {
    expect(Permissions.matches("bash", "bash", { command: "rm -rf .cache" })).toBe(true)
    expect(Permissions.matches("read*", "read_file", { path: "README.md" })).toBe(true)
    expect(Permissions.matches("bash:rm *", "bash", { command: "rm -rf .cache" })).toBe(true)
    expect(Permissions.matches("bash:*secret*", "bash", { args: ["cat", "secret.txt"] })).toBe(true)
    expect(Permissions.matches("bash:rm *", "bash", { command: "ls" })).toBe(false)
  })

  it("matches deny patterns against nested commands and fails closed for unprojectable params", () => {
    const ruleset: Permissions.Ruleset = {
      rules: [{ pattern: "bash:rm -rf*", level: "deny" }],
      fallback: "allow",
    }

    expect(Permissions.evaluate(ruleset, "bash", { command: ["rm", "-rf", "/"] })).toBe("deny")
    expect(Permissions.evaluate(ruleset, "bash", { input: { command: ["rm", "-rf", "/"] } })).toBe("deny")
    expect(Permissions.evaluate(ruleset, "bash", { commands: [{ executable: "rm -rf /tmp/cache" }] })).toBe("deny")
    expect(Permissions.evaluate(ruleset, "bash", { run: () => "rm -rf /" })).toBe("deny")
    expect(Permissions.evaluate(ruleset, "bash", { command: ["ls", "-la"] })).toBe("allow")
  })

  it("uses last-match semantics", () =>
    expect(
      Permissions.evaluate(
        {
          rules: [
            { pattern: "*", level: "deny" },
            { pattern: "bash", level: "allow" },
          ],
        },
        "bash",
        {},
      ),
    ).toBe("allow"))

  it("defaults unmatched rules to ask and honors an explicit fallback", () => {
    expect(Permissions.evaluate({ rules: [{ pattern: "read", level: "allow" }] }, "write", {})).toBe("ask")
    expect(Permissions.evaluate({ rules: [], fallback: "allow" }, "write", {})).toBe("allow")
  })

  ItLayer.make(it, "layerRuleset provides an evaluate-only policy", () => [
    Permissions.layerRuleset({
      rules: [
        { pattern: "bash", level: "allow" },
        { pattern: "bash:*ls*", level: "deny" },
      ],
    }),
    Effect.gen(function* () {
      const policy = yield* Permissions.Permissions
      expect((yield* policy.evaluate(request))._tag).toBe("Deny")
    }),
  ])

  ItLayer.make(it, "layerAllowAll provides an evaluate-only allow policy", () => [
    Permissions.layerAllowAll,
    Effect.gen(function* () {
      const policy = yield* Permissions.Permissions
      expect((yield* policy.evaluate(request))._tag).toBe("Allow")
    }),
  ])

  it.effect("uses the base decision as fallback and remembered last-match as overlay", () =>
    Effect.gen(function* () {
      const base: Permissions.Interface = { evaluate: () => Effect.succeed({ _tag: "Ask", token: "base-token" }) }
      const empty = yield* Permissions.evaluateWithRules(
        base,
        { rules: Effect.succeed([]), remember: () => Effect.void },
        request,
      )
      expect(empty).toEqual({ _tag: "Ask", token: "base-token" })
      const overlaid = yield* Permissions.evaluateWithRules(
        base,
        {
          rules: Effect.succeed([
            { pattern: "*", level: "deny" },
            { pattern: "bash", level: "allow" },
          ]),
          remember: () => Effect.void,
        },
        request,
      )
      expect(overlaid).toEqual({ _tag: "Allow" })
    }),
  )

  it.effect("keeps a base denial ahead of a remembered allow", () =>
    Effect.gen(function* () {
      const decision = yield* Permissions.evaluateWithRules(
        { evaluate: () => Effect.succeed({ _tag: "Deny", reason: "static deny" }) },
        {
          rules: Effect.succeed([{ pattern: "bash", level: "allow" }]),
          remember: () => Effect.void,
        },
        request,
      )

      expect(decision).toEqual({ _tag: "Deny", reason: "static deny" })
    }),
  )

  ItLayer.make(it, "layerRuleStoreMemory retains concurrent writes and replaces an identical pattern", () => [
    Permissions.layerRuleStoreMemory(),
    Effect.gen(function* () {
      const store = yield* Permissions.RuleStore
      const rules = Array.from({ length: 32 }, (_, index) => ({
        pattern: `tool-${index}`,
        level: "allow" as const,
      }))
      yield* Effect.all(rules.map(store.remember), { concurrency: 8 })
      yield* store.remember({ pattern: "tool-0", level: "deny", reason: "revoked" })

      const remembered = yield* store.rules
      expect(remembered).toHaveLength(32)
      expect(remembered.filter((rule) => rule.pattern === "tool-0")).toEqual([
        { pattern: "tool-0", level: "deny", reason: "revoked" },
      ])
    }),
  ])
})
