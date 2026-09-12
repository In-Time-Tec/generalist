import "./suites/event-telemetry-suite.js"
import { expect, it } from "@effect/vitest"
import { ProgramCapabilities, ProgramRunner, CodeExecutor, Gate } from "../../../src/index.js"
import { Effect, Layer, Schema, Stream } from "effect"
import { provideScoped } from "../execution/scoped-provide.js"
import { Errors, ExecutableResolver, LocalScheduler, RunEvent, Runtime, RunStore } from "../../../src/runtime/index.js"
import type { RunFailure as RunFailureType } from "../../../src/runtime/run/event.js"
import {
  alternateAssistant,
  alternateAssistantRef,
  assistantAddress,
  assistantRef,
  objectLayer,
  resolverLayer,
  textPrompt,
  registrationsFor,
} from "../execution/fixtures.js"
import { closedTestAgent } from "./identity.js"
import { makeObjectStorage, objectRuntimeLayer, objectWorkerId } from "../execution/object.js"

const failures: ReadonlyArray<RunFailureType> = [
  Errors.AgentExecutionFailure.make({ message: "agent failed", cause: new Error("model detail") }),
  Errors.AgentExecutionFailure.make({
    message: "completion gate failed",
    failure: Gate.GateFailed.make({ gate: { name: "quality", verdict: "fail", evidence: "rejected" } }),
  }),
  Errors.ExecutablePinMissing.make({ runId: "run:codec", ref: assistantRef.ref }),
  Errors.ExecutableIdentityMismatch.make({
    runId: "run:codec",
    expectedRef: assistantRef.ref,
    actualRef: alternateAssistantRef.ref,
  }),
  Errors.ExecutableRegistrationInvalid.make({ message: "invalid registration detail" }),
  Errors.ExecutableRegistrationMissing.make({ pin: "model:test" }),
  CodeExecutor.SandboxUnavailable.make({ message: "Worker Loader unavailable" }),
  CodeExecutor.SandboxExecutionFailure.make({ message: "sandbox detail" }),
  CodeExecutor.SandboxProtocolViolation.make({ message: "protocol detail" }),
  ProgramCapabilities.ProgramCapabilityMissing.make({ capability: "tools" }),
  ProgramCapabilities.ProgramCapabilityDenied.make({ capability: "tools", operation: "search", reason: "denied" }),
  ProgramCapabilities.ProgramAuthorizationFailure.make({
    capability: "tools",
    operation: "search",
    cause: { code: "AUTH", detail: "credential expired" },
  }),
  ProgramCapabilities.ProgramSchemaFailure.make({
    boundary: "tool-output",
    capability: "tools",
    message: "invalid output",
  }),
  ProgramCapabilities.ProgramToolFailure.make({ tool: "search", operation: "search", cause: { status: 503 } }),
  ProgramCapabilities.ProgramStepFailure.make({ step: "rank", operation: "rank", cause: { detail: "bad rank" } }),
  ProgramCapabilities.ProgramAgentFailure.make({
    selection: "researcher",
    operation: "research",
    cause: { detail: "child failed" },
  }),
  ProgramCapabilities.ProgramBudgetExhausted.make({ dimension: "outputBytes", limit: Number.MAX_SAFE_INTEGER }),
  ProgramCapabilities.ProgramReplayDivergence.make({ operation: "search", expected: "digest-a", actual: "digest-b" }),
  ProgramCapabilities.ProgramOperationUnknown.make({ operation: "externalLookup" }),
  ProgramCapabilities.ProgramSuspended.make({ operation: "approval", reason: "approval", token: "wait:1" }),
  ProgramCapabilities.ProgramCancelled.make({ reason: "cancelled by caller" }),
  ProgramRunner.ProgramHandlerMismatch.make({ kind: "tool", handlerName: "search", reason: "pin changed" }),
  ProgramRunner.ProgramIdentityMismatch.make({ expected: "source-a", actual: "source-b" }),
]

it.live("round-trips every RunFailure variant through object-backed history", () =>
  provideScoped(
    objectLayer,
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      for (const [index, failure] of failures.entries()) {
        const runId = `run:event-codec:${index}`
        const receipt = yield* runtime.send({
          runId,
          to: assistantAddress,
          sessionId: `session:event-codec:${index}`,
          idempotencyKey: `event-codec:${index}`,
          prompt: textPrompt("fail"),
        })
        const claim = yield* store.claimExecution({
          commandId: `runtime-run-event-test-ts-failure-claim-${index}`,
          runId: receipt.runId,
          ownerId: objectWorkerId,
        })
        yield* store.fail({ ...claim, error: failure })
        const terminal = (yield* runtime.history({ runId, cursor: -1, limit: 20 })).find(
          (event) => event._tag === "RunFailed",
        )
        expect(terminal?._tag).toBe("RunFailed")
        if (terminal?._tag !== "RunFailed") continue
        expect(terminal.error.constructor).toBe(failure.constructor)
        expect(yield* Schema.encodeEffect(RunEvent.RunFailure)(terminal.error)).toEqual(
          yield* Schema.encodeEffect(RunEvent.RunFailure)(failure),
        )
      }
    }),
  ),
)

it.live("keeps object failure history and inspection typed", () =>
  provideScoped(
    objectLayer,
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "codec:object",
        idempotencyKey: "codec:object",
        prompt: textPrompt("fail"),
      })
      const claim = yield* store.claimExecution({
        commandId: "runtime-run-event-test-ts-claim-1",
        runId: receipt.runId,
        ownerId: objectWorkerId,
      })
      const failure = failures.find((candidate) => candidate._tag === "generalist/core/ProgramOperationUnknown")!
      yield* store.fail({ ...claim, error: failure })
      yield* runtime.recordReward({
        commandId: "runtime-run-event-test-ts-recordReward-1",
        runId: receipt.runId,
        leaf: `${receipt.runId}:leaf`,
        value: 0.75,
        source: "eval:quality",
      })
      const snapshot = yield* runtime.snapshot(receipt.runId)
      const history = yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 20 })
      const terminal = history.find((event) => event._tag === "RunFailed")
      const rewarded = history.find((event) => event._tag === "Rewarded")
      expect(snapshot.run.status).toBe("failed")
      expect(snapshot.outcome?._tag).toBe("Failed")
      if (terminal?._tag !== "RunFailed") throw new Error("expected RunFailed")
      expect(terminal.error.constructor).toBe(failure.constructor)
      expect(rewarded).toMatchObject({ _tag: "Rewarded", value: 0.75, source: "eval:quality" })
      return yield* Schema.encodeEffect(RunEvent.RunFailure)(terminal.error)
    }),
  ),
)

it.live("reopens object failure history, stream, snapshot, and inspection with the typed failure", () => {
  const storage = makeObjectStorage()
  const options = {
    addresses: [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
  }
  let runId = ""
  const failure = Errors.ExecutableIdentityMismatch.make({
    runId: "run:object-codec",
    expectedRef: assistantRef.ref,
    actualRef: alternateAssistantRef.ref,
  })
  const write = provideScoped(
    objectRuntimeLayer(options, storage).pipe(Layer.provide(resolverLayer)),
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      runId = (yield* runtime.send({
        runId: failure.runId,
        to: assistantAddress,
        sessionId: "codec:object-reopen",
        idempotencyKey: "codec:object-reopen",
        prompt: textPrompt("fail"),
      })).runId
      const claim = yield* store.claimExecution({
        commandId: "runtime-run-event-test-ts-claim-2",
        runId,
        ownerId: objectWorkerId,
      })
      yield* store.fail({ ...claim, error: failure })
    }),
  )
  const reopen = provideScoped(
    objectRuntimeLayer(options, storage).pipe(Layer.provide(resolverLayer)),
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      expect((yield* runtime.inspect(runId)).status).toBe("failed")
      const snapshot = yield* runtime.snapshot(runId)
      expect(snapshot.outcome?._tag).toBe("Failed")
      const history = yield* runtime.history({ runId, cursor: -1, limit: 20 })
      const streamed = yield* runtime.events({ runId, cursor: -1 }).pipe(
        Stream.takeUntil((event) => event._tag === "RunFailed"),
        Stream.runCollect,
      )
      for (const events of [history, Array.from(streamed)]) {
        const terminal = events.find((event) => event._tag === "RunFailed")
        expect(terminal?._tag).toBe("RunFailed")
        if (terminal?._tag === "RunFailed") {
          expect(terminal.error).toBeInstanceOf(Errors.ExecutableIdentityMismatch)
          expect(terminal.error).toMatchObject({
            runId: failure.runId,
            expectedRef: failure.expectedRef,
            actualRef: failure.actualRef,
          })
        }
      }
    }),
  )
  return write.pipe(Effect.andThen(reopen))
})

it.live("makes a changed object resolver identity terminal once without scheduler retry", () => {
  const storage = makeObjectStorage()
  let runId = ""
  const admit = provideScoped(
    objectRuntimeLayer(
      {
        addresses: [
          { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
        ],
        scheduler: { pollInterval: "1 day" },
      },
      storage,
    ).pipe(Layer.provide(resolverLayer)),
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      runId = (yield* runtime.send({
        to: assistantAddress,
        sessionId: "resolver:changed",
        idempotencyKey: "resolver:changed",
        prompt: textPrompt("run"),
      })).runId
    }),
  )
  const changedResolver = ExecutableResolver.ExecutableResolver.of({
    resolve: () =>
      Effect.succeed({
        _tag: "Agent" as const,
        agent: closedTestAgent(alternateAssistant),
        attestation: alternateAssistantRef,
      }),
  })
  const execute = provideScoped(
    objectRuntimeLayer({ addresses: [], scheduler: { pollInterval: "1 day" } }, storage).pipe(
      Layer.provide(Layer.succeed(ExecutableResolver.ExecutableResolver, changedResolver)),
    ),
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const scheduler = yield* LocalScheduler.LocalScheduler
      yield* scheduler.tick
      yield* scheduler.idle
      yield* scheduler.tick
      yield* scheduler.idle
      expect((yield* runtime.inspect(runId)).status).toBe("failed")
      const history = yield* runtime.history({ runId, cursor: -1, limit: 20 })
      const terminalEvents = history.filter((event) => event._tag === "RunFailed")
      expect(terminalEvents).toHaveLength(1)
      expect(terminalEvents[0]?._tag === "RunFailed" && terminalEvents[0].error).toBeInstanceOf(
        Errors.ExecutableIdentityMismatch,
      )
      expect(history.filter((event) => event._tag === "RunAttemptStarted")).toHaveLength(1)
    }),
  )
  return admit.pipe(Effect.andThen(execute))
})
