import { expect, it } from "@effect/vitest"
import { ProgramCapabilities, ProgramHost, SandboxExecutor } from "@batonfx/core"
import { Effect, Schema, Stream } from "effect"
import { Errors, ExecutableResolver, LocalScheduler, RunEvent, Runtime, RunStore } from "../src/index.js"
import type { RunFailure as RunFailureType } from "../src/run-event.js"
import { decodeEvent, encodeEvent } from "../src/sql/codecs.js"
import {
  alternateAssistant,
  alternateAssistantRef,
  assistantAddress,
  assistantRef,
  memoryLayer,
  textPrompt,
} from "./helpers.js"
import { sqliteLayer, tempDbPath } from "./sqlite-helpers.js"
import { closedTestAgent } from "./identity.js"

const failures: ReadonlyArray<RunFailureType> = [
  Errors.AgentExecutionFailure.make({ message: "agent failed", cause: new Error("model detail") }),
  Errors.ExecutablePinMissing.make({ runId: "run:codec", ref: assistantRef.ref }),
  Errors.ExecutableIdentityMismatch.make({
    runId: "run:codec",
    expectedRef: assistantRef.ref,
    actualRef: alternateAssistantRef.ref,
  }),
  Errors.ExecutableRegistrationInvalid.make({ message: "invalid registration detail" }),
  Errors.ExecutableRegistrationMissing.make({ pin: "model:test" }),
  SandboxExecutor.SandboxUnavailable.make({ language: "javascript" }),
  SandboxExecutor.SandboxExecutionFailure.make({ message: "sandbox detail" }),
  SandboxExecutor.SandboxProtocolViolation.make({ message: "protocol detail" }),
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
  ProgramHost.ProgramBindingMismatch.make({ kind: "tool", name: "search", reason: "pin changed" }),
  ProgramHost.ProgramIdentityMismatch.make({ expected: "source-a", actual: "source-b" }),
]

const failedEvent = (error: RunFailureType) => ({
  _tag: "RunFailed" as const,
  specVersion: "1" as const,
  eventId: "run:codec:0",
  runId: "run:codec",
  sequence: 0,
  executableRef: assistantRef.ref,
  rootRunId: "run:codec",
  occurredAt: "2026-08-05T00:00:00.000Z",
  error,
})

it("round-trips every RunFailure variant through the durable RunEvent codec", () => {
  for (const failure of failures) {
    const decoded = decodeEvent(encodeEvent(failedEvent(failure)))
    expect(decoded._tag).toBe("RunFailed")
    if (decoded._tag !== "RunFailed") throw new Error("expected RunFailed")
    expect(decoded.error.constructor).toBe(failure.constructor)
    expect(Schema.encodeSync(RunEvent.RunFailure)(decoded.error)).toEqual(
      Schema.encodeSync(RunEvent.RunFailure)(failure),
    )
  }
})

it("rejects corrupted event payloads without fallback parsing", () => {
  const encoded = JSON.parse(encodeEvent(failedEvent(failures[0]!))) as Record<string, unknown>
  expect(() => decodeEvent(JSON.stringify({ ...encoded, sequence: -1 }))).toThrow()
  expect(() =>
    decodeEvent(JSON.stringify({ ...encoded, error: { _tag: "@batonfx/runtime/AgentExecutionFailure" } })),
  ).toThrow()
  expect(() => decodeEvent(JSON.stringify({ ...encoded, _tag: "UnknownEvent" }))).toThrow()
})

it.live("keeps memory and SQLite failure history and inspection in parity", () => {
  const failure = failures.find((candidate) => candidate._tag === "@batonfx/core/ProgramOperationUnknown")!
  const settle = (backend: "memory" | "sqlite") =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: `codec:${backend}`,
        idempotencyKey: `codec:${backend}`,
        prompt: textPrompt("fail"),
      })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: `codec-${backend}` })
      yield* store.fail({ ...claim, error: failure })
      const snapshot = yield* runtime.snapshot(receipt.runId)
      const terminal = (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 20 })).find(
        (event) => event._tag === "RunFailed",
      )
      expect(snapshot.run.status).toBe("failed")
      expect(snapshot.outcome?._tag).toBe("Failed")
      if (terminal?._tag !== "RunFailed") throw new Error("expected RunFailed")
      expect(terminal.error.constructor).toBe(failure.constructor)
      return Schema.encodeSync(RunEvent.RunFailure)(terminal.error)
    }).pipe(
      Effect.provide(backend === "memory" ? memoryLayer : sqliteLayer(tempDbPath("run-event-codec-parity"))),
      Effect.scoped,
    )
  return Effect.all([settle("memory"), settle("sqlite")]).pipe(
    Effect.tap(([memoryFailure, sqliteFailure]) => Effect.sync(() => expect(sqliteFailure).toEqual(memoryFailure))),
  )
})

it.live("reopens SQLite failure history, stream, snapshot, and inspection with the typed failure", () => {
  const filename = tempDbPath("run-event-codec")
  let runId = ""
  const failure = Errors.ExecutableIdentityMismatch.make({
    runId: "run:sqlite-codec",
    expectedRef: assistantRef.ref,
    actualRef: alternateAssistantRef.ref,
  })
  const write = Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore.RunStore
    runId = (yield* runtime.send({
      runId: failure.runId,
      to: assistantAddress,
      sessionId: "codec:sqlite",
      idempotencyKey: "codec:sqlite",
      prompt: textPrompt("fail"),
    })).runId
    const claim = yield* store.claimExecution({ runId, ownerId: "codec-sqlite" })
    yield* store.fail({ ...claim, error: failure })
  }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)
  const reopen = Effect.gen(function* () {
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
  }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)
  return write.pipe(Effect.andThen(reopen))
})

it.live("makes a changed SQLite resolver identity terminal once without scheduler retry", () => {
  const filename = tempDbPath("resolver-identity-terminal")
  let runId = ""
  const admit = Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    runId = (yield* runtime.send({
      to: assistantAddress,
      sessionId: "resolver:changed",
      idempotencyKey: "resolver:changed",
      prompt: textPrompt("run"),
    })).runId
  }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)
  const changedResolver = ExecutableResolver.ExecutableResolver.of({
    resolve: () =>
      Effect.succeed({
        _tag: "Agent" as const,
        agent: closedTestAgent(alternateAssistant),
        attestation: alternateAssistantRef,
      }),
  })
  const execute = Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const scheduler = yield* LocalScheduler.LocalScheduler
    yield* scheduler.tick
    yield* scheduler.tick
    expect((yield* runtime.inspect(runId)).status).toBe("failed")
    const history = yield* runtime.history({ runId, cursor: -1, limit: 20 })
    const terminalEvents = history.filter((event) => event._tag === "RunFailed")
    expect(terminalEvents).toHaveLength(1)
    expect(terminalEvents[0]?._tag === "RunFailed" && terminalEvents[0].error).toBeInstanceOf(
      Errors.ExecutableIdentityMismatch,
    )
    expect(history.filter((event) => event._tag === "RunAttemptStarted")).toHaveLength(1)
  }).pipe(
    Effect.provide(
      Runtime.layerSqlite({
        filename,
        resolver: changedResolver,
        addresses: [],
        scheduler: { pollInterval: "1 day" },
      }),
    ),
    Effect.scoped,
  )
  return admit.pipe(Effect.andThen(execute))
})
