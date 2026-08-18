import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { Response, Tool } from "effect/unstable/ai"
import { Approvals, Permissions, ToolAuthorization } from "../../src/core/index"

const call = Response.makePart("tool-call", {
  id: "call-1",
  name: "echo",
  params: { text: "hi" },
  providerExecuted: false,
})
const tool = Tool.make("echo", {
  description: "echo",
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.String,
})
const request: ToolAuthorization.Request = {
  call,
  tool,
  active: true,
  activeTools: ["echo"],
  activatedSkills: [],
  messages: [],
  agentName: "agent",
  turn: 1,
  sessionId: "session",
  onApprovalRequired: () => Effect.void,
}
const store = (rules: ReadonlyArray<Permissions.Rule> = []): Permissions.RuleStoreInterface => ({
  rules: Effect.succeed(rules),
  remember: () => Effect.void,
})
const permissions = (decision: Permissions.Decision): Permissions.Interface => ({
  evaluate: () => Effect.succeed(decision),
})

describe("ToolAuthorization", () => {
  it.effect("allows and denies in one pass", () =>
    Effect.gen(function* () {
      const approvals: Approvals.Interface = { resolve: () => Effect.succeed({ _tag: "Approved" }) }
      expect(
        (yield* ToolAuthorization.make({
          permissions: permissions({ _tag: "Allow" }),
          approvals,
          ruleStore: store(),
        }).authorize(request))._tag,
      ).toBe("Execute")
      expect(
        (yield* ToolAuthorization.make({
          permissions: permissions({ _tag: "Deny", reason: "no" }),
          approvals,
          ruleStore: store(),
        }).authorize(request))._tag,
      ).toBe("Deny")
    }),
  )

  it.effect("routes asks through Approved, Denied, and Pending resolutions", () =>
    Effect.gen(function* () {
      const policy = permissions({ _tag: "Ask", token: "approval-1" })
      for (const resolution of [
        { _tag: "Approved" },
        { _tag: "Denied" },
        { ...request, _tag: "Pending", token: "approval-1" },
      ] as const) {
        const result = yield* ToolAuthorization.make({
          permissions: policy,
          approvals: { resolve: () => Effect.succeed(resolution) },
          ruleStore: store(),
        }).authorize(request)
        expect(result._tag).toBe(
          resolution._tag === "Approved" ? "Execute" : resolution._tag === "Denied" ? "Deny" : "Suspend",
        )
      }
    }),
  )

  it.effect("emits the canonical approval request and keeps its identity stable", () =>
    Effect.gen(function* () {
      let observed: Parameters<ToolAuthorization.Request["onApprovalRequired"]>[0] | undefined
      const result = yield* ToolAuthorization.make({
        permissions: permissions({ _tag: "Ask", token: "approval-stable" }),
        approvals: {
          resolve: (pending) => Effect.succeed({ ...pending, token: "attempted-replacement" }),
        },
        ruleStore: store(),
      }).authorize({
        ...request,
        onApprovalRequired: (approval) =>
          Effect.sync(() => {
            observed = approval
          }),
      })
      expect(observed).toEqual({
        approvalId: "approval-stable",
        operation: "call-1",
        capability: "echo",
        input: { text: "hi" },
      })
      expect(result).toMatchObject({
        _tag: "Suspend",
        suspension: { token: "approval-stable", tool_call_id: "call-1", tool_name: "echo" },
      })
    }),
  )

  it.effect("remembers only the explicit rule carried by Approved", () =>
    Effect.gen(function* () {
      const remembered: Array<Permissions.Rule> = []
      const ruleStore: Permissions.RuleStoreInterface = {
        rules: Effect.succeed([]),
        remember: (rule) => Effect.sync(() => remembered.push(rule)),
      }
      yield* ToolAuthorization.make({
        permissions: permissions({ _tag: "Ask", token: "approval-1" }),
        approvals: {
          resolve: () => Effect.succeed({ _tag: "Approved", remember: { pattern: "echo", level: "allow" } }),
        },
        ruleStore,
      }).authorize(request)
      expect(remembered).toEqual([{ pattern: "echo", level: "allow" }])
    }),
  )

  it.effect("routes Allow plus needsApproval through Approvals.resolve", () =>
    Effect.gen(function* () {
      let resolutions = 0
      const gated = Tool.make("echo", {
        parameters: Schema.Struct({ text: Schema.String }),
        success: Schema.String,
        needsApproval: true,
      })
      const result = yield* ToolAuthorization.make({
        permissions: permissions({ _tag: "Allow" }),
        approvals: {
          resolve: () =>
            Effect.sync(() => {
              resolutions += 1
              return { _tag: "Denied", reason: "review denied" }
            }),
        },
        ruleStore: store(),
      }).authorize({ ...request, tool: gated })

      expect(resolutions).toBe(1)
      expect(result._tag).toBe("Deny")
    }),
  )

  it.effect("maps permission failures to AuthorizationError", () =>
    Effect.gen(function* () {
      const failure = yield* ToolAuthorization.make({
        permissions: {
          evaluate: () => Effect.fail(Permissions.PermissionError.make({ message: "policy unavailable" })),
        },
        approvals: { resolve: () => Effect.succeed({ _tag: "Approved" }) },
        ruleStore: store(),
      })
        .authorize(request)
        .pipe(Effect.flip)

      expect(failure).toMatchObject({ _tag: "tenetkit/core/AuthorizationError", message: "policy unavailable" })
    }),
  )

  it.effect("denies inactive calls before Permissions or Approvals", () =>
    Effect.gen(function* () {
      const result = yield* ToolAuthorization.make({
        permissions: { evaluate: () => Effect.die("inactive call must not evaluate") },
        approvals: { resolve: () => Effect.die("inactive call must not resolve") },
        ruleStore: { rules: Effect.die("inactive call must not read rules"), remember: () => Effect.void },
      }).authorize({ ...request, active: false })

      expect(result._tag).toBe("Deny")
    }),
  )

  it.effect("keeps concurrent resolutions associated with their calls", () =>
    Effect.gen(function* () {
      const secondCall = Response.makePart("tool-call", {
        id: "call-2",
        name: "echo",
        params: { text: "second" },
        providerExecuted: false,
      })
      const authorizer = ToolAuthorization.make({
        permissions: { evaluate: (access) => Effect.succeed({ _tag: "Ask", token: access.call.id }) },
        approvals: {
          resolve: (pending) =>
            Effect.succeed(
              pending.call.id === "call-1"
                ? ({ _tag: "Approved" } as const)
                : ({ _tag: "Denied", reason: "second denied" } as const),
            ),
        },
        ruleStore: store(),
      })

      const results = yield* Effect.forEach([request, { ...request, call: secondCall }], authorizer.authorize, {
        concurrency: 2,
      })
      expect(results.map((result) => result._tag)).toEqual(["Execute", "Deny"])
    }),
  )
})
