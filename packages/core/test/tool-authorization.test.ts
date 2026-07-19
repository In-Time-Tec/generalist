import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Option, Queue, Schema } from "effect"
import { Prompt, Response, Tool } from "effect/unstable/ai"
import { Approvals, Permissions, ToolAuthorization } from "../src/index"

const gated = Tool.make("gated", {
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.Unknown,
  needsApproval: () => true,
})

const call = Response.makePart("tool-call", {
  id: "call-1",
  name: "gated",
  params: { text: "run" },
  providerExecuted: false,
})

const request: ToolAuthorization.Request = {
  call,
  tool: gated,
  active: true,
  activeTools: ["gated"],
  activatedSkills: [],
  messages: Prompt.make("run").content,
  execution: {
    call,
    toolCallBatch: { calls: [call] },
    turn: 0,
    toolCallIndex: 0,
    agentName: "agent",
    sessionId: "session",
  },
  onApprovalRequired: Effect.void,
}

describe("ToolAuthorization", () => {
  it.effect("adapts Permissions without bypassing Approvals", () =>
    Effect.gen(function* () {
      const permissions: Permissions.Interface = {
        evaluate: () => Effect.succeed({ _tag: "Ask", token: "permission-1" }),
        await: () => Effect.succeed(Option.some({ _tag: "Approved" })),
      }
      const approvals: Approvals.Interface = {
        check: () => Effect.succeed({ _tag: "Denied", reason: "review denied" }),
      }

      const decision = yield* ToolAuthorization.fromPermissions(permissions, { approvals }).authorize(request)

      expect(decision._tag).toBe("Deny")
      if (decision._tag === "Deny") expect(decision.error.message).toBe("review denied")
    }),
  )

  it.effect("adapts Approvals and returns replay-safe suspension data", () =>
    Effect.gen(function* () {
      const approvals: Approvals.Interface = {
        check: () => Effect.succeed({ _tag: "Pending", token: "approval-1" }),
      }

      const decision = yield* ToolAuthorization.fromApprovals(approvals).authorize(request)

      expect(decision._tag).toBe("Suspend")
      if (decision._tag === "Suspend") {
        expect(decision.suspension.token).toBe("approval-1")
        expect(decision.suspension.tool_call_id).toBe("call-1")
      }
    }),
  )

  it.effect("maps permission service failures to AuthorizationError", () =>
    Effect.gen(function* () {
      const permissions: Permissions.Interface = {
        evaluate: () => Effect.fail(Permissions.PermissionError.make({ message: "policy unavailable" })),
        await: () => Effect.succeed(Option.none()),
      }

      const failure = yield* Effect.flip(ToolAuthorization.fromPermissions(permissions).authorize(request))

      expect(failure._tag).toBe("@batonfx/core/AuthorizationError")
      expect(failure.message).toBe("policy unavailable")
    }),
  )

  it.effect("gives remembered denials precedence over current allows", () =>
    Effect.gen(function* () {
      const permissions: Permissions.Interface = {
        evaluate: () => Effect.succeed({ _tag: "Allow" }),
        await: () => Effect.succeed(Option.none()),
      }
      const ruleStore: Permissions.RuleStoreInterface = {
        remember: () => Effect.void,
        rules: Effect.succeed([{ pattern: "gated", level: "deny" }]),
      }

      const decision = yield* ToolAuthorization.fromPermissions(permissions, { ruleStore }).authorize(request)

      expect(decision._tag).toBe("Deny")
    }),
  )

  it.effect("honors a captured denial on permission-stage resume despite a remembered allow", () =>
    Effect.gen(function* () {
      const permissions: Permissions.Interface = {
        evaluate: () => Effect.succeed({ _tag: "Allow" }),
        await: () => Effect.succeedSome({ _tag: "Denied", reason: "captured denial" }),
      }
      const ruleStore: Permissions.RuleStoreInterface = {
        remember: () => Effect.void,
        rules: Effect.succeed([{ pattern: "gated", level: "allow" }]),
      }

      const decision = yield* ToolAuthorization.fromPermissions(permissions, { ruleStore }).authorize({
        ...request,
        authorizationStage: "permission",
        authorizationToken: "original-permission-token",
      })

      expect(decision._tag).toBe("Deny")
      if (decision._tag === "Deny") expect(decision.error.message).toBe("captured denial")
    }),
  )

  it.effect("retains the authorization token when permission-stage resume has no answer", () =>
    Effect.gen(function* () {
      const permissions: Permissions.Interface = {
        evaluate: () => Effect.succeed({ _tag: "Allow" }),
        await: () => Effect.succeedNone,
      }

      const decision = yield* ToolAuthorization.fromPermissions(permissions).authorize({
        ...request,
        authorizationStage: "permission",
        authorizationToken: "original-permission-token",
      })

      expect(decision._tag).toBe("Suspend")
      if (decision._tag === "Suspend") expect(decision.suspension.token).toBe("original-permission-token")
    }),
  )

  it.effect("denies inactive calls before permission and approval compatibility services", () =>
    Effect.gen(function* () {
      const permissions: Permissions.Interface = {
        evaluate: () => Effect.die("inactive call must not evaluate permissions"),
        await: () => Effect.die("inactive call must not await permissions"),
      }
      const approvals: Approvals.Interface = {
        check: () => Effect.die("inactive call must not check approvals"),
      }

      const decision = yield* ToolAuthorization.fromPermissions(permissions, { approvals }).authorize({
        ...request,
        active: false,
      })

      expect(decision._tag).toBe("Deny")
    }),
  )

  it.effect("suspends for a remembered ask when Permissions is absent", () =>
    Effect.gen(function* () {
      const ruleStore: Permissions.RuleStoreInterface = {
        remember: () => Effect.void,
        rules: Effect.succeed([{ pattern: "gated:*run*", level: "ask" }]),
      }

      const decision = yield* ToolAuthorization.make({ ruleStore }).authorize(request)

      expect(decision._tag).toBe("Suspend")
      if (decision._tag === "Suspend") expect(decision.suspension.active_tools).toEqual(["gated"])
    }),
  )

  it.effect("does not re-evaluate dynamic approval on approval-stage resume", () =>
    Effect.gen(function* () {
      let checks = 0
      const dynamic = Tool.make("gated", {
        parameters: Schema.Struct({ text: Schema.String }),
        success: Schema.Unknown,
        needsApproval: () => {
          checks += 1
          return checks === 1
        },
      })
      const approvals: Approvals.Interface = {
        check: () => Effect.succeed({ _tag: "Denied", reason: "resume denied" }),
      }

      const decision = yield* ToolAuthorization.make({ approvals }).authorize({
        ...request,
        tool: dynamic,
        authorizationStage: "approval",
      })

      expect(decision._tag).toBe("Deny")
      expect(checks).toBe(0)
    }),
  )

  it.effect("notifies before both permission and dynamic approval waits", () =>
    Effect.gen(function* () {
      const notifications = yield* Queue.unbounded<void>()
      const approval = yield* Deferred.make<Approvals.Decision>()
      const permissions: Permissions.Interface = {
        evaluate: () => Effect.succeed({ _tag: "Ask", token: "permission-1" }),
        await: () => Effect.succeedSome({ _tag: "Approved" }),
      }
      const approvals: Approvals.Interface = {
        check: () => Deferred.await(approval),
      }
      const fiber = yield* ToolAuthorization.fromPermissions(permissions, { approvals })
        .authorize({
          ...request,
          onApprovalRequired: Queue.offer(notifications, undefined).pipe(Effect.asVoid),
        })
        .pipe(Effect.forkChild)

      yield* Queue.take(notifications)
      yield* Queue.take(notifications)
      yield* Deferred.succeed(approval, { _tag: "Approved" })
      expect((yield* Fiber.join(fiber))._tag).toBe("Execute")
    }),
  )

  it.effect("keeps concurrent permission answers associated with their calls", () =>
    Effect.gen(function* () {
      const permissions: Permissions.Interface = {
        evaluate: (evaluation) => Effect.succeed({ _tag: "Ask", token: `permission:${evaluation.toolCallId}` }),
        await: (pending) =>
          Effect.succeedSome(
            pending.toolCallId === "call-1"
              ? ({ _tag: "Approved" } as const)
              : ({ _tag: "Denied", reason: "second denied" } as const),
          ),
      }
      const secondCall = Response.makePart("tool-call", {
        id: "call-2",
        name: "gated",
        params: { text: "second" },
        providerExecuted: false,
      })
      const approvals: Approvals.Interface = { check: () => Effect.succeed({ _tag: "Approved" }) }
      const authorizer = ToolAuthorization.fromPermissions(permissions, { approvals })

      const decisions = yield* Effect.forEach(
        [request, { ...request, call: secondCall, execution: { ...request.execution, call: secondCall } }],
        authorizer.authorize,
        { concurrency: 2 },
      )

      expect(decisions.map((decision) => decision._tag)).toEqual(["Execute", "Deny"])
    }),
  )
})
