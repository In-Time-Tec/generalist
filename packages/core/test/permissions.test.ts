import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Option } from "effect"
import { Permissions } from "../src/index"

const request: Permissions.EvaluationRequest = {
  tool: "bash",
  params: { command: "rm -rf .cache" },
  agentName: "agent",
  turn: 0,
  toolCallId: "tool-call-1",
}

describe("Permissions", () => {
  it("matches tool names and tool argument globs", () => {
    expect(Permissions.matches("bash", "bash", { command: "rm -rf .cache" })).toBe(true)
    expect(Permissions.matches("read*", "read_file", { path: "README.md" })).toBe(true)
    expect(Permissions.matches("bash:rm *", "bash", { command: "rm -rf .cache" })).toBe(true)
    expect(Permissions.matches("bash:rm *", "bash", { command: "ls" })).toBe(false)
    expect(Permissions.matches("bash:*secret*", "bash", { args: ["cat", "secret.txt"] })).toBe(true)
  })

  it("matches deny patterns against array and nested command shapes", () => {
    const ruleset: Permissions.Ruleset = {
      rules: [{ pattern: "bash:rm -rf*", level: "deny" }],
      fallback: "allow",
    }

    expect(Permissions.matches("bash:rm -rf*", "bash", { command: ["rm", "-rf", "/"] })).toBe(true)
    expect(Permissions.evaluate(ruleset, "bash", { command: ["rm", "-rf", "/"] })).toBe("deny")
    expect(Permissions.evaluate(ruleset, "bash", { args: ["rm", "-rf", "/"] })).toBe("deny")
    expect(Permissions.evaluate(ruleset, "bash", { input: { command: ["rm", "-rf", "/"] } })).toBe("deny")
    expect(Permissions.evaluate(ruleset, "bash", { commands: [{ executable: "rm -rf /tmp/cache" }] })).toBe("deny")
    expect(Permissions.evaluate(ruleset, "bash", { command: ["ls", "-la"] })).toBe("allow")
  })

  it("fails closed on unprojectable params when a deny pattern is configured", () => {
    const ruleset: Permissions.Ruleset = {
      rules: [{ pattern: "bash:rm -rf*", level: "deny" }],
      fallback: "allow",
    }

    expect(Permissions.evaluate(ruleset, "bash", { run: () => "rm -rf /" })).toBe("deny")
  })

  it("evaluates rules with last-match wins and default ask", () => {
    expect(
      Permissions.evaluate(
        {
          rules: [
            { pattern: "bash", level: "allow" },
            { pattern: "bash:rm *", level: "deny" },
          ],
        },
        "bash",
        { command: "rm -rf .cache" },
      ),
    ).toBe("deny")
    expect(Permissions.evaluate({ rules: [{ pattern: "read", level: "allow" }] }, "write", {})).toBe("ask")
    expect(Permissions.evaluate({ rules: [], fallback: "allow" }, "write", {})).toBe("allow")
  })

  it.effect("fromRuleset allows, denies, and asks deterministically", () =>
    Effect.gen(function* () {
      const allow = yield* Permissions.Permissions
      const allowed = yield* allow.evaluate({ ...request, params: { command: "ls" } })
      const denied = yield* allow.evaluate(request)
      const asked = yield* allow.evaluate({ ...request, tool: "write", toolCallId: "tool-call-ask" })
      const pending = {
        token: asked._tag === "Ask" ? asked.token : "missing",
        tool: "write",
        params: {},
        agentName: "agent",
        turn: 0,
        toolCallId: "tool-call-ask",
      }

      expect(allowed._tag).toBe("Allow")
      expect(denied._tag).toBe("Deny")
      expect(asked).toEqual({ _tag: "Ask", token: "permission:tool-call-ask" })
      expect(Option.isNone(yield* allow.await(pending))).toBe(true)
    }).pipe(
      Effect.provide(
        Permissions.fromRuleset({
          rules: [
            { pattern: "bash", level: "allow" },
            { pattern: "bash:rm *", level: "deny" },
          ],
        }),
      ),
    ),
  )

  it.effect("allowAll approves every request", () =>
    Effect.gen(function* () {
      const permissions = yield* Permissions.Permissions

      expect((yield* permissions.evaluate(request))._tag).toBe("Allow")
    }).pipe(Effect.provide(Permissions.allowAll)),
  )

  it.effect("interactive awaits host-provided Deferred answers", () => {
    let answer: Deferred.Deferred<Permissions.Answer> | undefined
    return Effect.gen(function* () {
      const current = yield* Deferred.make<Permissions.Answer>()
      answer = current
      const permissions = yield* Permissions.Permissions
      const decision = yield* permissions.evaluate(request)
      const pending: Permissions.Pending = {
        token: decision._tag === "Ask" ? decision.token : "missing",
        tool: request.tool,
        params: request.params,
        agentName: request.agentName,
        turn: request.turn,
        ...(request.toolCallId === undefined ? {} : { toolCallId: request.toolCallId }),
      }

      const fiber = yield* permissions.await(pending).pipe(Effect.forkChild({ startImmediately: true }))
      yield* Deferred.succeed(current, { _tag: "Approved" })
      const resolved = yield* Fiber.join(fiber)

      expect(resolved).toEqual(Option.some({ _tag: "Approved" }))
    }).pipe(
      Effect.provide(
        Permissions.interactive({
          ruleset: { rules: [], fallback: "ask" },
          onAsk: () => (answer === undefined ? Effect.die("missing Deferred") : Deferred.await(answer)),
        }),
      ),
    )
  })

  it.effect("testLayer provides an exact implementation", () =>
    Effect.gen(function* () {
      const permissions = yield* Permissions.Permissions

      expect((yield* permissions.evaluate(request))._tag).toBe("Deny")
    }).pipe(
      Effect.provide(
        Permissions.testLayer({
          evaluate: () => Effect.succeed({ _tag: "Deny", reason: "no" }),
          await: () => Effect.succeed(Option.none()),
        }),
      ),
    ),
  )

  it.effect("ruleStoreTestLayer provides an exact implementation", () =>
    Effect.gen(function* () {
      const store = yield* Permissions.RuleStore

      yield* store.remember({ pattern: "bash", level: "allow" })
    }).pipe(
      Effect.provide(
        Permissions.ruleStoreTestLayer({
          remember: (rule) => Effect.sync(() => expect(rule).toEqual({ pattern: "bash", level: "allow" })),
        }),
      ),
    ),
  )
})
