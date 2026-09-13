/* oxlint-disable effecttsgo/strict-effect-provide -- Each test owns its scoped in-memory RuleStore Layer. */
import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { PermissionError, RuleStore, layerRuleStoreMemory, type Rule } from "../../../src/core/policy/permissions.js"
import { Approvals } from "../../../src/index.js"
import * as Runtime from "../../../src/runtime/engine.js"
import { RunStore } from "../../../src/runtime/run/store.js"
import { assistantAddress, objectLayer, openWait, suspension, textPrompt } from "../execution/fixtures.js"
import { objectWorkerId } from "../execution/object.js"

const rule = (pattern: string): Rule => ({ pattern, level: "allow" })

const token = (runId: string, suffix = "approval:test"): string =>
  `runtime-approval:${encodeURIComponent(runId)}:${suffix}`

const startRun = (key: string) =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const receipt = yield* runtime.send({
      to: assistantAddress,
      sessionId: `session:approval-resolution:${key}`,
      idempotencyKey: `approval-resolution:${key}`,
      prompt: textPrompt("resolve one durable approval"),
    })
    return receipt.runId
  })

const suspendOnApproval = (runId: string, waitToken: string) =>
  Effect.gen(function* () {
    const store = yield* RunStore
    const claim = yield* store.claimExecution({
      commandId: `${waitToken}:claim`,
      runId,
      ownerId: objectWorkerId,
    })
    yield* store.suspend({
      ...claim,
      waits: [openWait({ waitId: waitToken, reason: "approval" })],
      suspension: suspension({ waitId: waitToken, token: waitToken, reason: "approval" }),
    })
  })

const openWaits = (runId: string) =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    return (yield* runtime.inspect(runId)).waits.map((wait) => wait.waitId)
  })

layer(objectLayer)("Durable approval resolution", (it) => {
  it.effect("persists a remembered rule only after the Runtime accepts the resolution", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RuleStore
      const runId = yield* startRun("remember-success")
      const approval = token(runId)
      yield* suspendOnApproval(runId, approval)

      yield* Approvals.resolve(approval, Approvals.Approved({ remember: rule("shell") }), {
        commandId: "approve:remember-success",
      })

      expect(yield* store.rules).toEqual([rule("shell")])
      const obligations = (yield* runtime.operator.explain(runId)).obligations
      expect(obligations.some((obligation) => obligation._tag === "AwaitApproval")).toBe(false)
    }).pipe(Effect.provide(layerRuleStoreMemory())),
  )

  it.effect("leaves the RuleStore unchanged when the Run is unknown", () =>
    Effect.gen(function* () {
      const store = yield* RuleStore
      const failure = yield* Approvals.resolve(token("run:missing"), Approvals.Approved({ remember: rule("shell") }), {
        commandId: "approve:run-not-found",
      }).pipe(Effect.flip)

      expect(failure._tag).toBe("generalist/runtime/RunNotFound")
      expect(yield* store.rules).toEqual([])
    }).pipe(Effect.provide(layerRuleStoreMemory())),
  )

  it.effect("leaves the RuleStore unchanged for a stale approval", () =>
    Effect.gen(function* () {
      const store = yield* RuleStore
      const runId = yield* startRun("stale-approval")
      const failure = yield* Approvals.resolve(token(runId), Approvals.Approved({ remember: rule("shell") }), {
        commandId: "approve:stale",
      }).pipe(Effect.flip)

      expect(failure._tag).toBe("generalist/runtime/ApprovalStale")
      expect(yield* store.rules).toEqual([])
    }).pipe(Effect.provide(layerRuleStoreMemory())),
  )

  it.effect("leaves the RuleStore unchanged when the token does not match the open approval", () =>
    Effect.gen(function* () {
      const store = yield* RuleStore
      const runId = yield* startRun("approval-mismatch")
      const open = token(runId, "approval:open")
      yield* suspendOnApproval(runId, open)

      const failure = yield* Approvals.resolve(
        token(runId, "approval:other"),
        Approvals.Approved({ remember: rule("shell") }),
        { commandId: "approve:mismatch" },
      ).pipe(Effect.flip)

      expect(failure._tag).toBe("generalist/runtime/ApprovalMismatch")
      expect(yield* store.rules).toEqual([])
      expect(yield* openWaits(runId)).toEqual([open])
    }).pipe(Effect.provide(layerRuleStoreMemory())),
  )

  it.effect("keeps only the accepted rule when a conflicting duplicate answer is rejected", () =>
    Effect.gen(function* () {
      const store = yield* RuleStore
      const runId = yield* startRun("duplicate-conflict")
      const approval = token(runId)
      yield* suspendOnApproval(runId, approval)
      yield* Approvals.resolve(approval, Approvals.Approved({ remember: rule("shell") }), {
        commandId: "approve:first",
      })

      const failure = yield* Approvals.resolve(approval, Approvals.Approved({ remember: rule("shell:rm*") }), {
        commandId: "approve:second",
      }).pipe(Effect.flip)

      expect(failure._tag).toBe("generalist/runtime/ApprovalMismatch")
      expect(yield* store.rules).toEqual([rule("shell")])
    }).pipe(Effect.provide(layerRuleStoreMemory())),
  )

  it.effect("does not rewrite a rule on an identical retry after the wait closed", () =>
    Effect.gen(function* () {
      const store = yield* RuleStore
      const runId = yield* startRun("identical-retry")
      const approval = token(runId)
      yield* suspendOnApproval(runId, approval)
      yield* Approvals.resolve(approval, Approvals.Approved({ remember: rule("shell") }), {
        commandId: "approve:retry",
      })

      yield* Approvals.resolve(approval, Approvals.Approved({ remember: rule("shell:rm*") }), {
        commandId: "approve:retry",
      })

      expect(yield* store.rules).toEqual([rule("shell")])
    }).pipe(Effect.provide(layerRuleStoreMemory())),
  )

  it.effect("does not remember a rule for a denied decision", () =>
    Effect.gen(function* () {
      const store = yield* RuleStore
      const runId = yield* startRun("denied")
      const approval = token(runId)
      yield* suspendOnApproval(runId, approval)

      yield* Approvals.resolve(approval, Approvals.Denied({ reason: "not now" }), {
        commandId: "deny:one",
      })

      expect(yield* store.rules).toEqual([])
    }).pipe(Effect.provide(layerRuleStoreMemory())),
  )

  it.effect("fails a malformed token before any Runtime or RuleStore interaction", () =>
    Effect.gen(function* () {
      const store = yield* RuleStore
      const failure = yield* Approvals.resolve("permission:call-1", Approvals.Approved({ remember: rule("shell") }), {
        commandId: "approve:malformed",
      }).pipe(Effect.flip)

      expect(failure._tag).toBe("generalist/approvals/ApprovalTokenInvalid")
      expect(yield* store.rules).toEqual([])
    }).pipe(Effect.provide(layerRuleStoreMemory())),
  )

  it.effect("does not close the Runtime wait when the remember write fails", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const runId = yield* startRun("remember-failure")
      const approval = token(runId)
      yield* suspendOnApproval(runId, approval)

      const failure = yield* Approvals.resolve(approval, Approvals.Approved({ remember: rule("shell") }), {
        commandId: "approve:write-failure",
      }).pipe(
        Effect.provideService(
          RuleStore,
          RuleStore.of({
            remember: () => Effect.fail(PermissionError.make({ message: "rule store unavailable" })),
            rules: Effect.succeed([]),
          }),
        ),
        Effect.flip,
      )

      expect(failure._tag).toBe("generalist/core/PermissionError")
      expect((yield* runtime.inspect(runId)).status).toBe("waiting")
      expect(yield* openWaits(runId)).toEqual([approval])
    }),
  )

  it.effect("rejects an illegal operator approval before writing a rule", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RuleStore
      const runId = yield* startRun("operator-illegal")
      const approval = token(runId)
      yield* suspendOnApproval(runId, approval)

      const failure = yield* runtime.operator
        .resolveApproval(
          token(runId, "approval:other"),
          Approvals.Approved({ remember: rule("shell") }),
          "operator:test",
          "approve:operator-illegal",
        )
        .pipe(Effect.flip)

      expect(failure._tag).toBe("generalist/runtime/IllegalOperatorAction")
      expect(yield* store.rules).toEqual([])
      expect((yield* runtime.inspect(runId)).status).toBe("waiting")
    }).pipe(Effect.provide(layerRuleStoreMemory())),
  )

  it.effect("persists the operator remember rule before closing the wait", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RuleStore
      const runId = yield* startRun("operator-success")
      const approval = token(runId)
      yield* suspendOnApproval(runId, approval)

      yield* runtime.operator.resolveApproval(
        approval,
        Approvals.Approved({ remember: rule("shell") }),
        "operator:test",
        "approve:operator-success",
      )

      expect(yield* store.rules).toEqual([rule("shell")])
      expect(yield* openWaits(runId)).toEqual([])
    }).pipe(Effect.provide(layerRuleStoreMemory())),
  )

  it.effect("does not consult recovery for approved or denied decisions without a remember rule", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const scripted: Runtime.Service = {
        ...runtime,
        operator: {
          ...runtime.operator,
          explain: () => Effect.die("recovery must not be consulted without a remember rule"),
        },
        respondApproval: () => Effect.void,
      }

      yield* Approvals.resolve(token("run:scripted"), Approvals.Approved(), {
        commandId: "approve:scripted",
      }).pipe(Effect.provideService(Runtime.Runtime, scripted))
      yield* Approvals.resolve(token("run:scripted"), Approvals.Denied(), {
        commandId: "deny:scripted",
      }).pipe(Effect.provideService(Runtime.Runtime, scripted))
    }).pipe(Effect.provide(layerRuleStoreMemory())),
  )
})
