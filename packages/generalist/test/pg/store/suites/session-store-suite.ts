import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber, Layer, Option, Ref, Schema, Scope, Stream } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { Prompt, Response } from "effect/unstable/ai"
import { Handoff, Pins, Session } from "generalist"
import { Errors, RunEvent, Runtime, RunStore } from "generalist/runtime"
import {
  assistant,
  assistantAddress,
  assistantRef,
  researcherPin,
  researcherRef,
  textPrompt,
} from "../../../../../generalist/test/runtime/execution/fixtures.js"
import { postgresAvailable, postgresDatabase, postgresLayer, uniqueSession } from "../../database.js"

const describePostgres = postgresAvailable ? describe : describe.skip
const database = postgresDatabase("session_authority")
const runtimeLayer = database.provision(postgresLayer(database.url))

const scopedWith =
  <A, E>(layerValue: Layer.Layer<A, E, never>) =>
  <B, E2, R2 extends A | Scope.Scope>(effect: Effect.Effect<B, E2, R2>) =>
    Effect.scoped(Effect.flatMap(Layer.build(layerValue), (context) => effect.pipe(Effect.provideContext(context))))

const withRuntime = <A, E, R extends Runtime.Runtime | RunStore.RunStore | Scope.Scope>(
  effect: Effect.Effect<A, E, R>,
) => scopedWith(runtimeLayer)(effect)

const jsonValue = Schema.decodeUnknownSync(Schema.Json)

const completion = (operationKey: string, sessionParentId: string | null, text = "semantic answer") => {
  const response = { content: [Response.makePart("text", { text })], finishReason: "stop" as const }
  const unsigned = {
    operationId: operationKey,
    turn: 0,
    modelCallId: "model-call:postgres",
    modelAttemptId: "model-attempt:postgres",
    attempt: 0,
    sessionParentId,
    replayFromHistory: false,
    content: Schema.encodeSync(Schema.Array(Response.TextPart))(response.content),
    finishReason: "stop" as const,
    budgetCharge: 0,
  }
  const digest = Pins.digest(jsonValue(unsigned))
  return {
    outcome: { _tag: "Succeeded" as const, value: { ...unsigned, digest } },
    event: {
      _tag: "ModelResponseCommitted" as const,
      turn: 0,
      operationKey,
      modelCallId: "model-call:postgres",
      modelAttemptId: "model-attempt:postgres",
      attempt: 0,
      response,
      budgetCharge: 0,
      digest,
    },
  }
}

const interrupted = (operationKey: string, sessionParentId: string | null, text = "retained partial") => {
  const response = { content: text.length === 0 ? [] : [Response.makePart("text", { text })] }
  const identity = {
    turn: 0,
    operationKey,
    modelCallId: "model-call:postgres",
    modelAttemptId: "model-attempt:postgres",
    attempt: 0,
    sessionParentId,
    reason: "failure" as const,
  }
  const digest = Pins.digest(
    jsonValue({ ...identity, response: Schema.encodeSync(RunEvent.CompletedModelResponse)(response) }),
  )
  return { _tag: "ModelResponseInterrupted" as const, ...identity, response, digest }
}

const scheduleModel = (sessionId: string, label: string) =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore.RunStore
    const receipt = yield* runtime.send({
      to: assistantAddress,
      sessionId,
      idempotencyKey: label,
      prompt: textPrompt("answer"),
    })
    yield* store.activate({ runId: receipt.runId })
    const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: label })
    const operationKey = `${receipt.runId}:model:0`
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
    const maybeSession = yield* store.claimedSessionStore(claim)
    if (Option.isNone(maybeSession)) return yield* Effect.die("expected PostgreSQL Session authority")
    const prefix = yield* maybeSession.value.append({
      _tag: "Message",
      message: textPrompt("durable model input").content[0]!,
    })
    return { runtime, store, receipt, claim, operation, operationKey, session: maybeSession.value, prefix }
  })

const installFailureTrigger = (name: string, eventTag: string) =>
  scopedWith(database.client)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql.unsafe(`
        CREATE OR REPLACE FUNCTION ${name}() RETURNS trigger AS $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM generalist_run_events
            WHERE event_id = NEW.event_id AND event_json LIKE '%"_tag":"${eventTag}"%'
          ) THEN
            RAISE EXCEPTION 'forced ${eventTag} rollback';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `)
      // A deferred constraint trigger fails at COMMIT, after appendEvent has issued pg_notify.
      // PostgreSQL must discard that already-issued notification with the rest of the transaction.
      yield* sql.unsafe(`
        CREATE CONSTRAINT TRIGGER ${name}
        AFTER INSERT ON generalist_tree_event_index
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION ${name}()
      `)
    }),
  )

const removeFailureTrigger = (name: string) =>
  scopedWith(database.client)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql.unsafe(`DROP TRIGGER IF EXISTS ${name} ON generalist_tree_event_index`)
      yield* sql.unsafe(`DROP FUNCTION IF EXISTS ${name}()`)
    }),
  )

describePostgres("PostgreSQL Session authority", () => {
  it.live("implements stable retry, branching, checkpoint, takeover, reopen, and Run-independent paths", () =>
    Effect.gen(function* () {
      const sessionId = uniqueSession("session-contract")
      const result = yield* withRuntime(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          const receipt = yield* runtime.send({
            to: assistantAddress,
            sessionId,
            idempotencyKey: "session-contract-run",
            prompt: textPrompt("journal only"),
          })
          yield* store.activate({ runId: receipt.runId })
          const claimA = yield* store.claimExecution({ runId: receipt.runId, ownerId: "owner-a" })
          const sessionA = Option.getOrThrow(yield* store.claimedSessionStore(claimA))
          const id = yield* sessionA.reserveEntryId
          const input = { _tag: "Message" as const, message: textPrompt("first").content[0]! }
          const first = yield* sessionA.append(input, { id, expectedLeafId: null })
          expect(yield* sessionA.append(input, { id, expectedLeafId: null })).toEqual(first)

          const claimB = yield* store.claimExecution({ runId: receipt.runId, ownerId: "owner-b" })
          const sessionB = Option.getOrThrow(yield* store.claimedSessionStore(claimB))
          expect(BigInt(claimB.session.epoch)).toBeGreaterThan(BigInt(claimA.session.epoch))
          expect(yield* Effect.flip(sessionA.append(input, { id, expectedLeafId: null }))).toMatchObject({
            message: "Session write claim is stale",
          })
          expect(yield* sessionB.append(input, { id, expectedLeafId: null })).toEqual(first)
          const takeoverCheckpoint = {
            id: "takeover-checkpoint",
            parentId: first.id,
            projectedHistory: Prompt.make("takeover checkpoint"),
            telemetry: [],
          }
          expect((yield* sessionB.appendCheckpoint(takeoverCheckpoint))._tag).toBe("Appended")
          expect(yield* Effect.flip(sessionA.appendCheckpoint(takeoverCheckpoint))).toMatchObject({
            message: "Session write claim is stale",
          })
          expect((yield* sessionB.appendCheckpoint(takeoverCheckpoint))._tag).toBe("AlreadyPresent")
          const reader = Option.getOrThrow(yield* store.sessionReader(sessionId))
          expect((yield* reader.path(takeoverCheckpoint.id)).map((entry) => entry.id)).toEqual([
            first.id,
            takeoverCheckpoint.id,
          ])
          expect(yield* Effect.flip(sessionA.reserveEntryId)).toMatchObject({
            message: "Session write claim is stale",
          })
          expect(yield* sessionB.reserveEntryId).toBe("3")
          expect(yield* Effect.flip(sessionA.setLeaf(first.id))).toMatchObject({
            message: "Session write claim is stale",
          })
          yield* sessionB.setLeaf(first.id)
          const second = yield* sessionB.append(
            { _tag: "Message", message: textPrompt("second").content[0]! },
            { id: "stable-second", expectedLeafId: first.id },
          )
          const stale = yield* Effect.flip(
            sessionB.append(
              { _tag: "Message", message: textPrompt("stale").content[0]! },
              { id: "stale-writer", expectedLeafId: first.id },
            ),
          )
          expect(stale).toMatchObject({ reason: "stale-leaf" })
          yield* sessionB.setLeaf(first.id)
          const branch = yield* sessionB.append(
            { _tag: "Message", message: textPrompt("branch").content[0]! },
            { id: "branch", expectedLeafId: first.id },
          )
          const inactiveRetry = yield* Effect.flip(
            sessionB.append(
              { _tag: "Message", message: textPrompt("second").content[0]! },
              { id: second.id, expectedLeafId: first.id },
            ),
          )
          expect(inactiveRetry).toMatchObject({ reason: "stale-leaf" })
          const prepared = {
            id: "checkpoint",
            parentId: branch.id,
            projectedHistory: Prompt.make("projected"),
            telemetry: [],
          }
          expect((yield* sessionB.appendCheckpoint(prepared))._tag).toBe("Appended")
          expect((yield* sessionB.appendCheckpoint(prepared))._tag).toBe("AlreadyPresent")
          return { runId: receipt.runId, first, branch }
        }),
      )
      const { runId, first, branch } = result

      // Drop the Run journal itself. Session tables have no Run FK and the complete active path survives.
      yield* scopedWith(database.client)(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql`DELETE FROM generalist_tree_event_index WHERE run_id = ${runId}`
          yield* sql`DELETE FROM generalist_run_events WHERE run_id = ${runId}`
          yield* sql`DELETE FROM generalist_run_registrations WHERE run_id = ${runId}`
          yield* sql`DELETE FROM generalist_tree_roots WHERE root_run_id = ${runId}`
          yield* sql`DELETE FROM generalist_runs WHERE run_id = ${runId}`
          const foreignKeys = yield* sql<{ count: string }>`
            SELECT COUNT(*) AS count
            FROM information_schema.table_constraints tc
            JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
            WHERE tc.table_schema = current_schema()
              AND tc.table_name IN ('generalist_sessions', 'generalist_session_entries')
              AND tc.constraint_type = 'FOREIGN KEY'
              AND ccu.table_name = 'generalist_runs'
          `
          expect(Number(foreignKeys[0]!.count)).toBe(0)
        }),
      )
      const reopened = yield* withRuntime(
        Effect.gen(function* () {
          const store = yield* RunStore.RunStore
          const session = Option.getOrThrow(yield* store.sessionReader(sessionId))
          return yield* session.path()
        }),
      )
      expect(reopened.map((entry) => entry.id)).toEqual([first.id, branch.id, "checkpoint"])
      expect(Session.buildContext(reopened)).toEqual(Prompt.make("projected"))
    }),
  )

  it.live("rolls back completed outcome, checkpoint, Session entry, event, and subscriber notification", () =>
    withRuntime(
      Effect.gen(function* () {
        const state = yield* scheduleModel(uniqueSession("completed-rollback"), "completed-rollback")
        const exact = completion(state.operationKey, state.prefix.id)
        const checkpoint = {
          driverVersion: "1" as const,
          executable: assistantRef.ref,
          turn: 1,
          budget: { allocation: {}, remaining: {} },
          state: { committed: true },
        }
        const continuation = {
          schemaVersion: 1 as const,
          prompt: Prompt.make("continue"),
          nextTurn: 1,
          steeringEntryIds: [],
        }
        const before = yield* state.runtime.history({ runId: state.receipt.runId, limit: 100 })
        const seen = yield* Ref.make<ReadonlyArray<string>>([])
        const subscriber = yield* state.runtime
          .events({ runId: state.receipt.runId, cursor: before.at(-1)!.sequence })
          .pipe(
            Stream.tap((event) => Ref.update(seen, (tags) => [...tags, event._tag])),
            Stream.take(1),
            Stream.runCollect,
            Effect.forkChild({ startImmediately: true }),
          )
        const replacement = yield* state.store.claimExecution({
          runId: state.receipt.runId,
          ownerId: "completed-replacement",
        })
        expect(
          (yield* Effect.exit(
            state.store.commitModelResponse({
              ...state.claim,
              operationId: state.operation.operationId,
              checkpoint,
              continuation,
              ...exact,
            }),
          ))._tag,
        ).toBe("Failure")
        expect(
          (yield* state.store.getOperation({ runId: state.receipt.runId, operationId: state.operation.operationId }))
            .status,
        ).toBe("running")
        expect(yield* state.session.path()).toHaveLength(1)
        yield* installFailureTrigger("fail_completed_session_commit", "ModelResponseCommitted")
        const failed = yield* Effect.exit(
          state.store.commitModelResponse({
            ...replacement,
            operationId: state.operation.operationId,
            checkpoint,
            continuation,
            ...exact,
          }),
        )
        expect(failed._tag).toBe("Failure")
        expect(yield* state.runtime.history({ runId: state.receipt.runId, limit: 100 })).toEqual(before)
        expect(
          (yield* state.store.getOperation({ runId: state.receipt.runId, operationId: state.operation.operationId }))
            .status,
        ).toBe("running")
        expect(yield* state.session.path()).toHaveLength(1)
        expect((yield* state.store.loadExecution(state.receipt.runId)).checkpoint).toBeUndefined()
        expect((yield* state.store.loadExecution(state.receipt.runId)).continuation).toBeUndefined()
        expect(yield* Ref.get(seen)).toEqual([])
        yield* removeFailureTrigger("fail_completed_session_commit")
        yield* state.store.commitModelResponse({
          ...replacement,
          operationId: state.operation.operationId,
          checkpoint,
          continuation,
          ...exact,
        })
        yield* state.store.commitModelResponse({
          ...replacement,
          operationId: state.operation.operationId,
          checkpoint,
          continuation,
          ...exact,
        })
        const divergent = completion(state.operationKey, state.prefix.id, "divergent")
        expect(
          (yield* Effect.exit(
            state.store.commitModelResponse({
              ...replacement,
              operationId: state.operation.operationId,
              ...divergent,
            }),
          ))._tag,
        ).toBe("Failure")
        expect(Array.from(yield* Fiber.join(subscriber)).map((event) => event._tag)).toEqual(["ModelResponseCommitted"])
        expect(
          (yield* state.runtime.history({ runId: state.receipt.runId, limit: 100 })).filter(
            (event) => event._tag === "ModelResponseCommitted",
          ),
        ).toHaveLength(1)
        expect(yield* state.session.path()).toHaveLength(2)
        const committedExecution = yield* state.store.loadExecution(state.receipt.runId)
        expect(committedExecution.checkpoint).toEqual(checkpoint)
        expect(committedExecution.continuation).toEqual(continuation)
      }),
    ),
  )

  it.live("atomically commits interrupted output, rejects empty output, and keeps rollback invisible", () =>
    withRuntime(
      Effect.gen(function* () {
        const noOutput = yield* scheduleModel(uniqueSession("interrupted-empty"), "interrupted-empty")
        const noOutputFailure = Errors.AgentExecutionFailure.make({ message: "model produced no output" })
        yield* noOutput.store.completeOperation({
          ...noOutput.claim,
          operationId: noOutput.operation.operationId,
          outcome: { _tag: "Failed", error: noOutputFailure },
        })
        yield* noOutput.store.fail({ ...noOutput.claim, error: noOutputFailure })
        const noOutputHistory = yield* noOutput.runtime.history({ runId: noOutput.receipt.runId, limit: 100 })
        expect(noOutputHistory.map((event) => event._tag)).not.toContain("ModelResponseInterrupted")
        expect(noOutputHistory.at(-1)?._tag).toBe("RunFailed")
        expect(yield* noOutput.session.path()).toHaveLength(1)

        const state = yield* scheduleModel(uniqueSession("interrupted-rollback"), "interrupted-rollback")
        const empty = interrupted(state.operationKey, state.prefix.id, "")
        expect(
          (yield* Effect.exit(
            state.store.commitInterruptedModelResponse({
              ...state.claim,
              operationId: state.operation.operationId,
              outcome: { _tag: "Failed", error: Errors.AgentExecutionFailure.make({ message: "empty" }) },
              event: empty,
            }),
          ))._tag,
        ).toBe("Failure")
        expect(yield* state.session.path()).toHaveLength(1)
        const exact = interrupted(state.operationKey, state.prefix.id)
        const outcome = {
          _tag: "Failed" as const,
          error: Errors.AgentExecutionFailure.make({ message: "model terminated" }),
        }
        const before = yield* state.runtime.history({ runId: state.receipt.runId, limit: 100 })
        const seen = yield* Ref.make<ReadonlyArray<string>>([])
        const subscriber = yield* state.runtime
          .events({ runId: state.receipt.runId, cursor: before.at(-1)!.sequence })
          .pipe(
            Stream.tap((event) => Ref.update(seen, (tags) => [...tags, event._tag])),
            Stream.take(1),
            Stream.runCollect,
            Effect.forkChild({ startImmediately: true }),
          )
        const replacement = yield* state.store.claimExecution({
          runId: state.receipt.runId,
          ownerId: "interrupted-replacement",
        })
        expect(
          (yield* Effect.exit(
            state.store.commitInterruptedModelResponse({
              ...state.claim,
              operationId: state.operation.operationId,
              outcome,
              event: exact,
            }),
          ))._tag,
        ).toBe("Failure")
        expect(
          (yield* state.store.getOperation({ runId: state.receipt.runId, operationId: state.operation.operationId }))
            .status,
        ).toBe("running")
        expect(yield* state.session.path()).toHaveLength(1)
        yield* installFailureTrigger("fail_interrupted_session_commit", "ModelResponseInterrupted")
        expect(
          (yield* Effect.exit(
            state.store.commitInterruptedModelResponse({
              ...replacement,
              operationId: state.operation.operationId,
              outcome,
              event: exact,
            }),
          ))._tag,
        ).toBe("Failure")
        expect(
          (yield* state.store.getOperation({ runId: state.receipt.runId, operationId: state.operation.operationId }))
            .status,
        ).toBe("running")
        expect(yield* state.session.path()).toHaveLength(1)
        expect(yield* Ref.get(seen)).toEqual([])
        yield* removeFailureTrigger("fail_interrupted_session_commit")
        yield* state.store.commitInterruptedModelResponse({
          ...replacement,
          operationId: state.operation.operationId,
          outcome,
          event: exact,
        })
        yield* state.store.commitInterruptedModelResponse({
          ...replacement,
          operationId: state.operation.operationId,
          outcome,
          event: exact,
        })
        const divergent = interrupted(state.operationKey, state.prefix.id, "different partial")
        expect(
          (yield* Effect.exit(
            state.store.commitInterruptedModelResponse({
              ...replacement,
              operationId: state.operation.operationId,
              outcome,
              event: divergent,
            }),
          ))._tag,
        ).toBe("Failure")
        expect(Array.from(yield* Fiber.join(subscriber)).map((event) => event._tag)).toEqual([
          "ModelResponseInterrupted",
        ])
        expect(
          (yield* state.runtime.history({ runId: state.receipt.runId, limit: 100 })).filter(
            (event) => event._tag === "ModelResponseInterrupted",
          ),
        ).toHaveLength(1)
        expect(yield* state.session.path()).toHaveLength(2)
        yield* state.store.fail({ ...replacement, error: outcome.error })
        const settled = yield* state.runtime.history({ runId: state.receipt.runId, limit: 100 })
        expect(settled.findIndex((event) => event._tag === "ModelResponseInterrupted")).toBeLessThan(
          settled.findIndex((event) => event._tag === "RunFailed"),
        )
      }),
    ),
  )

  it.live("imports and verifies an exact handoff projection atomically across reopen", () =>
    Effect.gen(function* () {
      const sessionId = uniqueSession("handoff-projection")
      let runId = ""
      let operationId = ""
      const operationKey = "handoff:postgres-projection"
      const projectedHistory = Prompt.make("projected-for-specialist")
      const checkpoint = {
        driverVersion: "1" as const,
        executable: researcherRef.ref,
        turn: 1,
        budget: { allocation: {}, remaining: {} },
        state: {},
      }
      const commit: Handoff.Commit = {
        _tag: "Commit",
        state: {
          root: assistant.name,
          active: "specialist",
          path: [{ handoffId: operationKey, source: assistant.name, target: "specialist", turn: 0 }],
          edgeCounts: [{ source: assistant.name, target: "specialist", count: 1 }],
          handoffCount: 1,
          pendingContinuation: { prompt: Prompt.make("continue") },
        },
        sessionEntryId: `${operationKey}:session-projection`,
        sessionParentId: null,
        projectedHistory,
        targetAgentPin: researcherPin,
      }
      yield* withRuntime(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          const receipt = yield* runtime.send({
            to: assistantAddress,
            sessionId,
            idempotencyKey: "handoff-projection",
            prompt: textPrompt("supervisor sentinel"),
          })
          runId = receipt.runId
          yield* store.activate({ runId })
          const claim = yield* store.claimExecution({ runId, ownerId: "handoff-projection" })
          const operation = yield* store.recordOperation({
            ...claim,
            operationKey,
            kind: "handoff",
            inputDigest: operationKey,
            input: { targetAgentPin: researcherRef.ref.active },
            replayPolicy: "pure",
            attempt: claim.attempt,
          })
          operationId = operation.operationId
          yield* store.startOperation({ ...claim, operationId })
          const staleComplete = {
            ...claim,
            operationId,
            outcome: { _tag: "Succeeded" as const, value: commit },
            checkpoint,
          }
          const replacement = yield* store.claimExecution({ runId, ownerId: "handoff-projection-replacement" })
          expect((yield* Effect.exit(store.completeOperation(staleComplete)))._tag).toBe("Failure")
          expect((yield* store.getOperation({ runId, operationId })).status).toBe("running")
          const complete = { ...staleComplete, ...replacement }
          const invalid = yield* Effect.exit(
            store.completeOperation({
              ...complete,
              outcome: {
                _tag: "Succeeded",
                value: {
                  ...commit,
                  projectedHistory: Prompt.fromMessages([
                    Prompt.makeMessage("system", { content: "must not persist" }),
                  ]),
                },
              },
            }),
          )
          expect(invalid._tag).toBe("Failure")
          expect((yield* store.getOperation({ runId, operationId })).status).toBe("running")
          yield* store.completeOperation(complete)
          yield* store.completeOperation(complete)
          const session = yield* store.claimedSessionStore(replacement)
          if (Option.isNone(session)) return yield* Effect.die("expected PostgreSQL Session authority")
          yield* session.value.append({ _tag: "Message", message: Prompt.make("descendant").content[0]! })
          yield* store.completeOperation(complete)
          const before = yield* session.value.path()
          expect(
            (yield* Effect.exit(
              store.completeOperation({ ...complete, checkpoint: { ...checkpoint, state: { divergent: true } } }),
            ))._tag,
          ).toBe("Failure")
          expect(
            (yield* Effect.exit(
              store.completeOperation({
                ...complete,
                outcome: { _tag: "Succeeded", value: { ...commit, projectedHistory: Prompt.make("wrong") } },
              }),
            ))._tag,
          ).toBe("Failure")
          expect(yield* session.value.path()).toEqual(before)
          expect((yield* store.loadExecution(runId)).executableRef).toEqual(researcherRef.ref)
        }),
      )
      yield* withRuntime(
        Effect.gen(function* () {
          const store = yield* RunStore.RunStore
          expect((yield* store.getOperation({ runId, operationId })).status).toBe("succeeded")
          const session = yield* store.sessionReader(sessionId)
          if (Option.isNone(session)) return yield* Effect.die("expected reopened PostgreSQL Session")
          expect(Session.buildContext(yield* session.value.path())).toEqual(
            Prompt.concat(projectedHistory, Prompt.make("descendant")),
          )
          expect((yield* store.loadExecution(runId)).executableRef).toEqual(researcherRef.ref)
        }),
      )
    }),
  )
})
