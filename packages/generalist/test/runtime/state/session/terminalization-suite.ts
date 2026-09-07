import { expect, it } from "@effect/vitest"
import { Cause, Effect, Layer, Option, Schema, Scope } from "effect"
import { Response } from "effect/unstable/ai"
import { Pins, Session } from "../../../../src/index.js"
import { Errors, Runtime, RunStore } from "../../../../src/runtime/index.js"
import { CompletedModelResponse } from "../../../../src/runtime/run/event.js"
import { assistantAddress, completedResult, objectLayer, textPrompt } from "../../execution/fixtures.js"
import { objectWorkerId } from "../../execution/object.js"

const jsonValue = <A>(value: A): Schema.Json =>
  Schema.decodeUnknownSync(Schema.Json)(
    Schema.decodeSync(Schema.fromJsonString(Schema.Unknown))(
      Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(value),
    ),
  )

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
    replayFromHistory: false,
    content: encoded.content,
    finishReason: encoded.finishReason,
    budgetCharge: 0,
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
      budgetCharge: 0,
      digest,
    },
  }
}

const scheduleToolCalls = (terminal: "cancelled" | "failed") => {
  const layer = objectLayer
  return scopedWith(layer)(
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const sessionId = `session:tool-terminalization:object:${terminal}`
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId,
        idempotencyKey: `tool-terminalization:object:${terminal}`,
        prompt: textPrompt("run both children"),
      })
      const claim = yield* store.claimExecution({
        commandId: `runtime-state-session-terminalization-${terminal}-claim-1`,
        runId: receipt.runId,
        ownerId: objectWorkerId,
      })
      const session = yield* store.claimedSessionStore(claim)
      if (Option.isNone(session)) return yield* Effect.die("expected Session store")
      const prefix = yield* session.value.append(
        {
          _tag: "Message",
          message: textPrompt("run both children").content[0]!,
        },
        { commandId: "runtime-state-session-terminalization-prefix" },
      )
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
      yield* store.startOperation({
        commandId: `runtime-state-session-terminalization-${terminal}-startOperation-1`,
        ...claim,
        operationId: modelOperation.operationId,
      })
      const calls = [
        { id: "call-completed-child", name: "run_child" },
        { id: "call-operation-fallback-child", name: "run_child" },
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
      yield* store.startOperation({
        commandId: `runtime-state-session-terminalization-${terminal}-startOperation-2`,
        ...claim,
        operationId: decoy.operationId,
      })
      yield* store.completeOperation({
        ...claim,
        operationId: decoy.operationId,
        outcome: {
          _tag: "Failed",
          error: Errors.AgentExecutionFailure.make({ message: "decoy operation must not own the call" }),
        },
      })
      const operations = []
      for (const call of calls.slice(0, 3)) {
        const operation = yield* store.recordOperation({
          ...claim,
          operationKey: `${receipt.runId}:tool:0:${call.id}:${call.name}`,
          kind: "tool",
          inputDigest: Pins.digest({ turn: 0, callId: call.id, name: call.name }),
          input: { turn: 0, callId: call.id, name: call.name },
          replayPolicy: "never",
          attempt: 0,
        })
        yield* store.startOperation({
          commandId: `runtime-state-session-terminalization-${terminal}-startOperation-${operation.operationId}`,
          ...claim,
          operationId: operation.operationId,
        })
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
      const noOutputPaths: ReadonlyArray<string> = []
      const boundedOperationResult = {
        inline: {
          truncated: true as const,
          bytes: 61_442,
          maxBytes: 51_200,
          digest: "a".repeat(64),
          preview: "bounded operation fallback",
        },
        outputPaths: noOutputPaths,
      }
      yield* store.completeOperation({
        ...claim,
        operationId: operations[1]!.operationId,
        outcome: {
          _tag: "Succeeded",
          value: {
            _tag: "Success",
            result: boundedOperationResult,
            encodedResult: boundedOperationResult,
            outputPaths: [],
          },
        },
      })
      const completedCall = yield* Schema.decodeEffect(
        Response.ToolCallPart("run_child", Schema.Struct({ task: Schema.String })),
      )({
        type: "tool-call",
        id: calls[0].id,
        name: calls[0].name,
        params: { task: calls[0].id },
        providerExecuted: false,
      }).pipe(Effect.mapError((error) => Errors.AgentExecutionFailure.make({ message: String(error) })))
      yield* store.emitAgentEvent({
        commandId: `runtime-state-session-terminalization-${terminal}-emitAgentEvent-1`,
        ...claim,
        event: {
          _tag: "ToolExecutionCompleted",
          turn: 0,
          call: completedCall,
          result: Object.assign(
            Response.toolResultPart({
              id: completedCall.id,
              name: completedCall.name,
              isFailure: false,
              result: "completed event result",
              encodedResult: "completed event encoded result",
              providerExecuted: false,
              preliminary: false,
            }),
            { taint: [] },
          ),
        },
      })
      yield* store.expireRunningOperation({
        commandId: `runtime-state-session-terminalization-${terminal}-expireRunningOperation-1`,
        ...claim,
        operationId: operations[2]!.operationId,
      })
      const terminalFailure = Errors.AgentExecutionFailure.make({ message: "execution failed" })
      if (terminal === "cancelled") {
        yield* runtime.cancel({
          commandId: `runtime-state-session-terminalization-${terminal}-cancel-1`,
          runId: receipt.runId,
          reason: "user cancelled",
        })
        yield* runtime.cancel({
          commandId: `runtime-state-session-terminalization-${terminal}-cancel-1`,
          runId: receipt.runId,
          reason: "user cancelled",
        })
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
        const unresolvedPath = yield* session.value.path()
        expect(unresolvedPath.filter((entry) => entry.metadata?.terminalRunId === receipt.runId)).toEqual([])
        expect(Session.unresolvedToolCalls(Session.buildContext(unresolvedPath)).length).toBeGreaterThan(0)
        yield* runtime.resolveOperation({
          runId: receipt.runId,
          operationId: operations[2]!.operationId,
          idempotencyKey: `terminalization:object:resolve-unknown`,
          resolution: {
            _tag: "Succeeded",
            value: {
              _tag: "Success",
              result: "reconciled operation result",
              encodedResult: "reconciled operation encoded result",
            },
          },
        })
      } else {
        yield* store.fail({ ...claim, error: terminalFailure })
      }

      expect((yield* runtime.inspect(receipt.runId)).status).toBe(terminal)
      const path = yield* session.value.path()
      const context = Session.buildContext(path)
      expect(Session.unresolvedToolCalls(context)).toEqual([])
      const terminalEntries = path.filter((entry) => entry.metadata?.terminalRunId === receipt.runId)
      expect(terminalEntries).toHaveLength(1)
      const results = context.content.flatMap((message) => {
        if (Schema.is(Schema.String)(message.content)) return []
        return message.content.filter((part) => part.type === "tool-result")
      })
      expect(results).toHaveLength(4)
      expect(results[0]).toMatchObject({
        id: calls[0].id,
        isFailure: false,
        result: "completed event encoded result",
      })
      expect(results[1]).toMatchObject({
        id: calls[1].id,
        isFailure: false,
        result: boundedOperationResult,
      })
      expect(results[2]).toMatchObject(
        terminal === "cancelled"
          ? {
              id: calls[2].id,
              isFailure: false,
              result: "reconciled operation encoded result",
            }
          : {
              id: calls[2].id,
              isFailure: true,
              result: { _tag: "Unknown", operationId: operations[2]!.operationId },
            },
      )
      expect(results[3]).toMatchObject({
        id: calls[3].id,
        isFailure: true,
        result:
          terminal === "cancelled"
            ? { _tag: "Cancelled", reason: "user cancelled" }
            : {
                _tag: "Failed",
                error: { _tag: "generalist/runtime/AgentExecutionFailure", message: "execution failed" },
              },
      })
    }),
  )
}

it.effect("atomically closes unresolved tool calls on cancellation and failure in object storage", () =>
  Effect.gen(function* () {
    yield* scheduleToolCalls("cancelled")
    yield* scheduleToolCalls("failed")
  }),
)

it.effect("rejects successful Run settlement while its Session still has an unresolved tool call", () =>
  scopedWith(objectLayer)(
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:reject-unresolved-completion",
        idempotencyKey: "reject-unresolved-completion",
        prompt: textPrompt("run child"),
      })
      const claim = yield* store.claimExecution({
        commandId: "runtime-state-session-terminalization-test-ts-claim-2",
        runId: receipt.runId,
        ownerId: objectWorkerId,
      })
      const session = yield* store.claimedSessionStore(claim)
      if (Option.isNone(session)) return yield* Effect.die("expected Session store")
      const prefix = yield* session.value.append(
        { _tag: "Message", message: textPrompt("run child").content[0]! },
        { commandId: "runtime-state-session-terminalization-prefix-reject" },
      )
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
      yield* store.startOperation({
        commandId: `runtime-state-session-terminalization-test-ts-startOperation-${operation.operationId}`,
        ...claim,
        operationId: operation.operationId,
      })
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
      const rejected = yield* Effect.exit(
        store.complete({
          commandId: "runtime-state-session-terminalization-test-ts-complete-reject",
          ...claim,
          result: completedResult("impossible"),
        }),
      )
      expect(rejected._tag).toBe("Failure")
      if (rejected._tag === "Failure") {
        expect(Cause.squash(rejected.cause)).toBeInstanceOf(Errors.RuntimeUnavailable)
      }
      expect((yield* runtime.inspect(receipt.runId)).status).toBe("running")
      expect(Session.unresolvedToolCalls(Session.buildContext(yield* session.value.path()))).toHaveLength(1)
    }),
  ),
)
