import { Database } from "bun:sqlite"
import { expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Schema, Scope } from "effect"
import { Response } from "effect/unstable/ai"
import { Pins, Session } from "@batonfx/core"
import { Errors, Runtime, RunStore } from "../src/index.js"
import { CompletedModelResponse } from "../src/run-event.js"
import { assistantAddress, completedResult, memoryLayer, textPrompt } from "./helpers.js"
import { sqliteLayer, tempDbPath } from "./sqlite-helpers.js"

const jsonValue = (value: unknown): unknown => JSON.parse(Schema.encodeSync(Schema.UnknownFromJsonString)(value))

const scopedWith =
  <A, E>(layer: Layer.Layer<A, E, never>) =>
  <B, E2, R extends A | Scope.Scope>(effect: Effect.Effect<B, E2, R>): Effect.Effect<B, E | E2> =>
    Effect.scoped(Effect.flatMap(Layer.build(layer), (context) => effect.pipe(Effect.provideContext(context))))

const modelCompletion = (input: {
  readonly runId: string
  readonly operationKey: string
  readonly sessionParentId: string
  readonly calls: ReadonlyArray<{ readonly id: string; readonly name: string }>
}) => {
  const response = {
    content: input.calls.map((call) =>
      Response.makePart("tool-call", {
        id: call.id,
        name: call.name,
        params: { task: call.id },
        providerExecuted: false,
      }),
    ),
    finishReason: "tool-calls" as const,
  }
  const encoded = Schema.encodeSync(CompletedModelResponse)(response)
  const unsigned = {
    operationId: input.operationKey,
    turn: 0,
    modelCallId: `${input.runId}:model-call:0`,
    modelAttemptId: `${input.runId}:model-attempt:0`,
    attempt: 0,
    sessionParentId: input.sessionParentId,
    messages: [],
    content: encoded.content,
    finishReason: encoded.finishReason,
  }
  const digest = Pins.digest(jsonValue(unsigned))
  return {
    outcome: { _tag: "Succeeded" as const, value: { ...unsigned, digest } },
    event: {
      _tag: "ModelResponseCommitted" as const,
      turn: 0,
      operationKey: input.operationKey,
      modelCallId: unsigned.modelCallId,
      modelAttemptId: unsigned.modelAttemptId,
      attempt: 0,
      response,
      digest,
    },
  }
}

const scheduleToolCalls = (backend: "memory" | "sqlite", terminal: "cancelled" | "failed") => {
  const layer = backend === "memory" ? memoryLayer : sqliteLayer(tempDbPath(`session-tool-terminalization-${terminal}`))
  return scopedWith(layer)(
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const sessionId = `session:tool-terminalization:${backend}:${terminal}`
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId,
        idempotencyKey: `tool-terminalization:${backend}:${terminal}`,
        prompt: textPrompt("run both children"),
      })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "terminalization-test" })
      const session = yield* store.sessionStore(sessionId)
      if (Option.isNone(session)) return yield* Effect.die("expected Session store")
      const prefix = yield* session.value.append({
        _tag: "Message",
        message: textPrompt("run both children").content[0]!,
      })
      const modelOperationKey = `${receipt.runId}:model:0:0:conversation`
      const modelOperation = yield* store.recordOperation({
        ...claim,
        operationKey: modelOperationKey,
        kind: "model",
        inputDigest: Pins.digest({ turn: 0 }),
        input: { turn: 0 },
        replayPolicy: "never",
        attempt: 0,
      })
      yield* store.startOperation({ ...claim, operationId: modelOperation.operationId })
      const calls = [
        { id: "call-completed-child", name: "run_child" },
        { id: "call-unknown-child", name: "run_child" },
        { id: "call-not-started-child", name: "run_child" },
      ] as const
      yield* store.commitModelResponse({
        ...claim,
        operationId: modelOperation.operationId,
        ...modelCompletion({
          runId: receipt.runId,
          operationKey: modelOperationKey,
          sessionParentId: prefix.id,
          calls,
        }),
      })
      const decoy = yield* store.recordOperation({
        ...claim,
        operationKey: `${receipt.runId}:tool:decoy`,
        kind: "tool",
        inputDigest: Pins.digest({ turn: 0, callId: calls[0].id, name: calls[0].name }),
        input: { turn: 0, callId: calls[0].id, name: calls[0].name },
        replayPolicy: "never",
        attempt: 0,
      })
      yield* store.startOperation({ ...claim, operationId: decoy.operationId })
      yield* store.completeOperation({
        ...claim,
        operationId: decoy.operationId,
        outcome: {
          _tag: "Failed",
          error: Errors.AgentExecutionFailure.make({ message: "decoy operation must not own the call" }),
        },
      })
      const operations = []
      for (const call of calls.slice(0, 2)) {
        const operation = yield* store.recordOperation({
          ...claim,
          operationKey: `${receipt.runId}:tool:0:${call.id}:${call.name}`,
          kind: "tool",
          inputDigest: Pins.digest({ turn: 0, callId: call.id, name: call.name }),
          input: { turn: 0, callId: call.id, name: call.name },
          replayPolicy: "never",
          attempt: 0,
        })
        yield* store.startOperation({ ...claim, operationId: operation.operationId })
        operations.push(operation)
      }
      yield* store.completeOperation({
        ...claim,
        operationId: operations[0]!.operationId,
        outcome: {
          _tag: "Succeeded",
          value: { _tag: "Success", result: "operation result", encodedResult: "operation encoded result" },
        },
      })
      const completedCall = Response.makePart("tool-call", {
        id: calls[0].id,
        name: calls[0].name,
        params: { task: calls[0].id },
        providerExecuted: false,
      })
      yield* store.emitAgentEvent({
        ...claim,
        event: {
          _tag: "ToolExecutionCompleted",
          turn: 0,
          call: completedCall,
          result: Response.toolResultPart({
            id: completedCall.id,
            name: completedCall.name,
            isFailure: false,
            result: "completed event result",
            encodedResult: "completed event encoded result",
            providerExecuted: false,
            preliminary: false,
          }),
        },
      })
      yield* store.expireRunningOperation({ ...claim, operationId: operations[1]!.operationId })
      const terminalFailure = Errors.AgentExecutionFailure.make({ message: "execution failed" })
      if (terminal === "cancelled") {
        yield* runtime.cancel({ runId: receipt.runId, reason: "user cancelled" })
        yield* runtime.cancel({ runId: receipt.runId, reason: "user cancelled" })
      } else {
        yield* store.fail({ ...claim, error: terminalFailure })
      }

      expect((yield* runtime.inspect(receipt.runId)).status).toBe(terminal)
      const path = yield* session.value.path()
      const context = Session.buildContext(path)
      expect(Session.unresolvedToolCalls(context)).toEqual([])
      const terminalEntries = path.filter((entry) => entry.metadata?.terminalRunId === receipt.runId)
      expect(terminalEntries).toHaveLength(1)
      const results = context.content.flatMap((message) =>
        typeof message.content === "string" ? [] : message.content.filter((part) => part.type === "tool-result"),
      )
      expect(results).toHaveLength(3)
      expect(results[0]).toMatchObject({
        id: calls[0].id,
        isFailure: false,
        result: "completed event encoded result",
      })
      expect(results[1]).toMatchObject({
        id: calls[1].id,
        isFailure: true,
        result: { _tag: "Unknown", operationId: operations[1]!.operationId },
      })
      expect(results[2]).toMatchObject({
        id: calls[2].id,
        isFailure: true,
        result:
          terminal === "cancelled"
            ? { _tag: "Cancelled", reason: "user cancelled" }
            : {
                _tag: "Failed",
                error: { _tag: "@batonfx/runtime/AgentExecutionFailure", message: "execution failed" },
              },
      })
    }),
  )
}

it.effect("atomically closes unresolved tool calls on cancellation and failure in memory and SQLite", () =>
  Effect.gen(function* () {
    yield* scheduleToolCalls("memory", "cancelled")
    yield* scheduleToolCalls("sqlite", "cancelled")
    yield* scheduleToolCalls("memory", "failed")
    yield* scheduleToolCalls("sqlite", "failed")
  }),
)

it.effect("rejects successful Run settlement while its Session still has an unresolved tool call", () =>
  scopedWith(memoryLayer)(
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:reject-unresolved-completion",
        idempotencyKey: "reject-unresolved-completion",
        prompt: textPrompt("run child"),
      })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "terminalization-test" })
      const session = yield* store.sessionStore("session:reject-unresolved-completion")
      if (Option.isNone(session)) return yield* Effect.die("expected Session store")
      const prefix = yield* session.value.append({ _tag: "Message", message: textPrompt("run child").content[0]! })
      const operationKey = `${receipt.runId}:model:0:0:conversation`
      const operation = yield* store.recordOperation({
        ...claim,
        operationKey,
        kind: "model",
        inputDigest: Pins.digest({ turn: 0 }),
        input: { turn: 0 },
        replayPolicy: "never",
        attempt: 0,
      })
      yield* store.startOperation({ ...claim, operationId: operation.operationId })
      yield* store.commitModelResponse({
        ...claim,
        operationId: operation.operationId,
        ...modelCompletion({
          runId: receipt.runId,
          operationKey,
          sessionParentId: prefix.id,
          calls: [{ id: "call-unresolved", name: "run_child" }],
        }),
      })
      const rejected = yield* Effect.exit(store.complete({ ...claim, result: completedResult("impossible") }))
      expect(rejected._tag).toBe("Failure")
      if (rejected._tag === "Failure") {
        expect(rejected.cause.toString()).toContain("cannot complete with unresolved tool calls")
      }
      expect((yield* runtime.inspect(receipt.runId)).status).toBe("running")
      expect(Session.unresolvedToolCalls(Session.buildContext(yield* session.value.path()))).toHaveLength(1)
    }),
  ),
)

it.live("rolls back terminal Session results when SQLite Run settlement fails", () => {
  const filename = tempDbPath("session-tool-terminalization-rollback")
  return scopedWith(sqliteLayer(filename))(
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const sessionId = "session:tool-terminalization-rollback"
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId,
        idempotencyKey: "tool-terminalization-rollback",
        prompt: textPrompt("run child"),
      })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "terminalization-test" })
      const session = yield* store.sessionStore(sessionId)
      if (Option.isNone(session)) return yield* Effect.die("expected Session store")
      const prefix = yield* session.value.append({ _tag: "Message", message: textPrompt("run child").content[0]! })
      const operationKey = `${receipt.runId}:model:0:0:conversation`
      const operation = yield* store.recordOperation({
        ...claim,
        operationKey,
        kind: "model",
        inputDigest: Pins.digest({ turn: 0 }),
        input: { turn: 0 },
        replayPolicy: "never",
        attempt: 0,
      })
      yield* store.startOperation({ ...claim, operationId: operation.operationId })
      yield* store.commitModelResponse({
        ...claim,
        operationId: operation.operationId,
        ...modelCompletion({
          runId: receipt.runId,
          operationKey,
          sessionParentId: prefix.id,
          calls: [{ id: "call-cancelled", name: "run_child" }],
        }),
      })
      yield* runtime.cancel({ runId: receipt.runId, reason: "user cancelled" })
      const database = new Database(filename)
      database.exec(`
        CREATE TRIGGER fail_terminal_run_after_session
        BEFORE INSERT ON baton_run_events
        WHEN NEW.run_id = '${receipt.runId.replaceAll("'", "''")}'
          AND NEW.event_json LIKE '%"_tag":"RunCancelled"%'
        BEGIN
          SELECT RAISE(ABORT, 'forced terminal settlement rollback');
        END
      `)
      const failure = Errors.AgentExecutionFailure.make({ message: "execution interrupted" })
      expect((yield* Effect.exit(store.fail({ ...claim, error: failure })))._tag).toBe("Failure")
      expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelling")
      const rolledBackPath = yield* session.value.path()
      expect(rolledBackPath.some((entry) => entry.metadata?.terminalRunId === receipt.runId)).toBe(false)
      expect(Session.unresolvedToolCalls(Session.buildContext(rolledBackPath))).toHaveLength(1)

      database.exec("DROP TRIGGER fail_terminal_run_after_session")
      database.close()
      yield* store.fail({ ...claim, error: failure })
      expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelled")
      expect(Session.unresolvedToolCalls(Session.buildContext(yield* session.value.path()))).toEqual([])
    }),
  )
})
