import { Database } from "bun:sqlite"
import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Option, Ref, Schedule, Schema, Scope, Stream } from "effect"
import { AiError, LanguageModel, Prompt, Response } from "effect/unstable/ai"
import { Agent, Compaction, ModelResilience, Pins } from "tenetkit"
import {
  Address,
  Cursor,
  Errors,
  ExecutableResolver,
  ExecutionHost,
  Runtime,
  RunStore,
} from "../../src/runtime/index.js"
import { testExecutable } from "./identity.js"
import { assistantAddress, memoryLayer, registrationsFor, textPrompt } from "./helpers.js"
import { sqliteLayer, tempDbPath } from "./sqlite-helpers.js"
import { CompletedModelResponse } from "../../src/runtime/run-event.js"

const jsonValue = (value: unknown): unknown => JSON.parse(Schema.encodeSync(Schema.UnknownFromJsonString)(value))
const jsonText = Schema.encodeSync(Schema.UnknownFromJsonString)

const interrupted = (
  operationKey: string,
  sessionParentId: string | null,
  text = "retained partial",
  reason: "cancel" | "failure" = "failure",
) => {
  const response = { content: [Response.makePart("text", { text })] }
  const identity = {
    turn: 0,
    operationKey,
    modelCallId: "model-call:1",
    modelAttemptId: "model-attempt:1",
    attempt: 0,
    sessionParentId,
    reason,
  }
  const unsigned = { ...identity, response: Schema.encodeSync(CompletedModelResponse)(response) }
  return {
    _tag: "ModelResponseInterrupted" as const,
    ...identity,
    response,
    digest: Pins.digest(jsonValue(unsigned)),
  }
}

const failure = Errors.AgentExecutionFailure.make({ message: "model terminated" })
const failedOutcome = { _tag: "Failed" as const, error: failure }

const scopedWith =
  <A, E>(layer: Layer.Layer<A, E, never>) =>
  <B, E2, R extends A | Scope.Scope>(effect: Effect.Effect<B, E2, R>): Effect.Effect<B, E | E2> =>
    Effect.scoped(Effect.flatMap(Layer.build(layer), (context) => effect.pipe(Effect.provideContext(context))))

const directCommit = (backend: "memory" | "sqlite") => {
  const filename = backend === "sqlite" ? tempDbPath("interrupted-direct") : undefined
  const runtimeLayer = backend === "memory" ? memoryLayer : sqliteLayer(filename!)
  return scopedWith(runtimeLayer)(
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: `session:interrupted-direct:${backend}`,
        idempotencyKey: `interrupted-direct:${backend}`,
        prompt: textPrompt("answer"),
      })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "interrupted-direct" })
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
      const session = yield* store.sessionStore(`session:interrupted-direct:${backend}`)
      if (Option.isNone(session)) return yield* Effect.die("expected Session store")
      const prefix = yield* session.value.append({
        _tag: "Message",
        message: textPrompt("durable input").content[0]!,
      })
      const exact = interrupted(operationKey, prefix.id)
      yield* store.commitInterruptedModelResponse({
        ...claim,
        operationId: operation.operationId,
        outcome: failedOutcome,
        event: exact,
      })
      yield* store.commitInterruptedModelResponse({
        ...claim,
        operationId: operation.operationId,
        outcome: failedOutcome,
        event: exact,
      })

      const beforeDivergence = yield* runtime.history({ runId: receipt.runId, limit: 100 })
      const pathBefore = yield* session.value.path()
      const divergent = interrupted(operationKey, prefix.id, "different partial")
      const rejected = yield* Effect.exit(
        store.commitInterruptedModelResponse({
          ...claim,
          operationId: operation.operationId,
          outcome: failedOutcome,
          event: divergent,
        }),
      )
      expect(rejected._tag).toBe("Failure")
      expect(yield* runtime.history({ runId: receipt.runId, limit: 100 })).toEqual(beforeDivergence)
      expect(yield* session.value.path()).toEqual(pathBefore)

      const record = yield* store.getOperation({ runId: receipt.runId, operationId: operation.operationId })
      const events = beforeDivergence.filter((event) => event._tag === "ModelResponseInterrupted")
      expect(record).toMatchObject({
        status: "failed",
        error: { _tag: "tenetkit/runtime/AgentExecutionFailure", message: "model terminated" },
      })
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ digest: exact.digest, sessionParentId: prefix.id })
      expect(events[0]).not.toHaveProperty("response")
      const event = events[0]
      if (event === undefined) return yield* Effect.die("expected interrupted event")
      expect(yield* runtime.resolveModelResponse(event)).toEqual(exact.response)
      const corrupt = yield* runtime.resolveModelResponse({ ...event, digest: "corrupt" }).pipe(Effect.flip)
      expect(corrupt).toMatchObject({
        _tag: "tenetkit/runtime/SessionEntryCorrupt",
        sessionId: event.sessionId,
        entryId: event.sessionEntryId,
      })
      const wrongParent = yield* runtime
        .resolveModelResponse({ ...event, sessionParentId: "wrong-parent" })
        .pipe(Effect.flip)
      expect(wrongParent).toMatchObject({ _tag: "tenetkit/runtime/SessionEntryCorrupt" })
      expect(pathBefore).toHaveLength(2)
      const interruptedEntry = pathBefore.at(-1)
      expect(interruptedEntry?.parentId).toBe(prefix.id)
      expect(interruptedEntry).toMatchObject({
        _tag: "ModelResponse",
        metadata: { interruptionDigest: exact.digest },
      })
      expect(
        interruptedEntry?._tag === "ModelResponse" &&
          interruptedEntry.content.some((part) => part.type === "text" && part.text === "retained partial"),
      ).toBe(true)
    }),
  )
}

it.effect("atomically commits one exact interrupted outcome, event, and Session entry in memory and SQLite", () =>
  Effect.gen(function* () {
    yield* directCommit("memory")
    yield* directCommit("sqlite")
  }),
)

it.live("rolls back SQLite outcome, Session entry, event, and subscriber notification together", () => {
  const filename = tempDbPath("interrupted-rollback")
  return scopedWith(sqliteLayer(filename))(
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:interrupted-rollback",
        idempotencyKey: "interrupted-rollback",
        prompt: textPrompt("answer"),
      })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "interrupted-rollback" })
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
      const before = yield* runtime.history({ runId: receipt.runId, limit: 100 })
      const seen = yield* Ref.make<ReadonlyArray<string>>([])
      const subscriber = yield* runtime.events({ runId: receipt.runId, cursor: before.at(-1)!.sequence }).pipe(
        Stream.tap((event) => Ref.update(seen, (tags) => [...tags, event._tag])),
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild({ startImmediately: true }),
      )
      const database = new Database(filename)
      database.exec(`
        CREATE TRIGGER fail_interrupted_commit_after_event
        BEFORE UPDATE ON baton_tree_roots
        WHEN EXISTS (
          SELECT 1 FROM baton_run_events
          WHERE run_id = '${receipt.runId.replaceAll("'", "''")}'
            AND event_json LIKE '%"_tag":"ModelResponseInterrupted"%'
        )
        BEGIN
          SELECT RAISE(ABORT, 'forced interrupted commit rollback');
        END
      `)
      const rejected = yield* Effect.exit(
        store.commitInterruptedModelResponse({
          ...claim,
          operationId: operation.operationId,
          outcome: failedOutcome,
          event: interrupted(operationKey, null),
        }),
      )
      expect(rejected._tag).toBe("Failure")
      expect(yield* runtime.history({ runId: receipt.runId, limit: 100 })).toEqual(before)
      expect((yield* store.getOperation({ runId: receipt.runId, operationId: operation.operationId })).status).toBe(
        "running",
      )
      const session = yield* store.sessionStore("session:interrupted-rollback")
      expect(Option.isSome(session) ? yield* session.value.path() : []).toEqual([])
      expect(yield* Ref.get(seen)).toEqual([])
      database.exec("DROP TRIGGER fail_interrupted_commit_after_event")
      database.close()
      yield* Fiber.interrupt(subscriber)
    }),
  )
})

const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { uncached: 1, total: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

const hostLayer = (input: {
  readonly backend: "memory" | "sqlite"
  readonly label: string
  readonly streamText: Parameters<typeof LanguageModel.make>[0]["streamText"]
  readonly resilience?: Layer.Layer<ModelResilience.ModelResilience, ModelResilience.ModelResilienceMisconfigured>
}) => {
  const agent = Agent.make({ name: input.label })
  const executable = testExecutable(agent, `${input.label}-v1`)
  const address = Address.make(`agent:${input.label}`)
  const model = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: input.streamText,
    }),
  )
  const compaction = Compaction.layer({
    contextWindow: 1_000_000,
    reserveTokens: 0,
    keepRecentTokens: 1_000_000,
    summaryModel: model,
  })
  const environment =
    input.resilience === undefined
      ? Layer.merge(model, compaction)
      : Layer.mergeAll(model, compaction, input.resilience.pipe(Layer.orDie))
  const resolver = ExecutableResolver.makeStatic([{ executable, agent: Agent.close(agent, environment) }])
  const options = {
    resolver,
    addresses: [{ address, executable, registrations: registrationsFor(executable) }],
    scheduler: { pollInterval: "1 day" as const },
  }
  return {
    address,
    layer:
      input.backend === "memory"
        ? Runtime.layerMemory(options)
        : Runtime.layerSqlite({ ...options, filename: tempDbPath(input.label) }),
  }
}

for (const backend of ["memory", "sqlite"] as const) {
  it.effect(`${backend} commits a text partial before Run cancellation and exposes it to the later Session`, () =>
    Effect.gen(function* () {
      const partialSeen = yield* Deferred.make<void>()
      const prompts: Array<Prompt.Prompt> = []
      let calls = 0
      const hosted = hostLayer({
        backend,
        label: `interrupted-cancel-${backend}`,
        streamText: (request) => {
          prompts.push(request.prompt)
          calls += 1
          return calls === 1
            ? Stream.make(Response.makePart("text-delta", { id: "partial", delta: "kept on cancel" })).pipe(
                Stream.concat(
                  Stream.fromEffect(Deferred.succeed(partialSeen, undefined)).pipe(Stream.flatMap(() => Stream.never)),
                ),
              )
            : Stream.make(Response.makePart("text-delta", { id: "answer", delta: "later answer" }), finish)
        },
      })
      yield* scopedWith(hosted.layer)(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          const host = yield* ExecutionHost.ExecutionHost
          const sessionId = `session:interrupted-cancel:${backend}`
          const first = yield* runtime.send({
            to: hosted.address,
            sessionId,
            idempotencyKey: "first",
            prompt: "begin",
          })
          const running = yield* host
            .execute(yield* store.claimExecution({ runId: first.runId, ownerId: "cancel-host" }))
            .pipe(Effect.forkChild({ startImmediately: true }))
          yield* Deferred.await(partialSeen)
          yield* runtime.cancel({ runId: first.runId, reason: "stop" })
          yield* Fiber.join(running)
          const history = yield* runtime.history({ runId: first.runId, cursor: Cursor.origin, limit: 100 })
          const interruptedIndex = history.findIndex((event) => event._tag === "ModelResponseInterrupted")
          const cancelledIndex = history.findIndex((event) => event._tag === "RunCancelled")
          expect(interruptedIndex).toBeGreaterThan(-1)
          expect(interruptedIndex).toBeLessThan(cancelledIndex)
          expect(history[interruptedIndex]).toMatchObject({ reason: "cancel" })
          const interruptedEvent = history[interruptedIndex]
          if (interruptedEvent?._tag !== "ModelResponseInterrupted") return
          const interruptedEntry = yield* runtime.sessionEntry({
            sessionId: interruptedEvent.sessionId,
            entryId: interruptedEvent.sessionEntryId,
          })
          expect(
            interruptedEntry._tag === "ModelResponse" &&
              interruptedEntry.content.some((part) => part.type === "text" && part.text === "kept on cancel"),
          ).toBe(true)
          expect(
            yield* store.getOperationByKey({
              runId: first.runId,
              operationKey: `${first.runId}:model:0:0:conversation`,
            }),
          ).toMatchObject({
            status: "failed",
            error: { _tag: "tenetkit/runtime/AgentExecutionFailure", message: "execution interrupted" },
          })

          const second = yield* runtime.send({
            to: hosted.address,
            sessionId,
            idempotencyKey: "second",
            prompt: "continue",
          })
          yield* host.execute(yield* store.claimExecution({ runId: second.runId, ownerId: "later-host" }))
          const secondInspection = yield* runtime.inspect(second.runId)
          if (secondInspection.status === "failed") {
            const secondHistory = yield* runtime.history({ runId: second.runId, limit: 100 })
            const failedEvent = secondHistory.find((event) => event._tag === "RunFailed")
            throw new Error(failedEvent?._tag === "RunFailed" ? failedEvent.error.message : "second run failed")
          }
          expect(secondInspection.status).toBe("succeeded")
          const laterText = prompts[1]?.content.flatMap((message) =>
            typeof message.content === "string"
              ? [message.content]
              : message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])),
          )
          expect(laterText).toContain("kept on cancel")
        }),
      )
    }),
  )

  it.effect(`${backend} commits a text partial before terminal model failure`, () => {
    const escaped = AiError.make({
      module: "InterruptedRuntimeTest",
      method: "streamText",
      reason: AiError.RateLimitError.make({}),
    })
    const hosted = hostLayer({
      backend,
      label: `interrupted-failure-${backend}`,
      streamText: () =>
        Stream.make(Response.makePart("text-delta", { id: "partial", delta: "kept on failure" })).pipe(
          Stream.concat(Stream.fail(escaped)),
        ),
    })
    return scopedWith(hosted.layer)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const host = yield* ExecutionHost.ExecutionHost
        const receipt = yield* runtime.send({
          to: hosted.address,
          sessionId: `session:interrupted-failure:${backend}`,
          idempotencyKey: "failure",
          prompt: "fail",
        })
        yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "failure-host" }))
        const history = yield* runtime.history({ runId: receipt.runId, limit: 100 })
        const interruptedIndex = history.findIndex((event) => event._tag === "ModelResponseInterrupted")
        const failedIndex = history.findIndex((event) => event._tag === "RunFailed")
        expect(interruptedIndex).toBeGreaterThan(-1)
        expect(interruptedIndex).toBeLessThan(failedIndex)
        expect(history[interruptedIndex]).toMatchObject({ reason: "failure" })
        const interruptedEvent = history[interruptedIndex]
        if (interruptedEvent?._tag !== "ModelResponseInterrupted") return
        const interruptedEntry = yield* runtime.sessionEntry({
          sessionId: interruptedEvent.sessionId,
          entryId: interruptedEvent.sessionEntryId,
        })
        expect(
          interruptedEntry._tag === "ModelResponse" &&
            interruptedEntry.content.some((part) => part.type === "text" && part.text === "kept on failure"),
        ).toBe(true)
        expect(
          (yield* store.getOperationByKey({
            runId: receipt.runId,
            operationKey: `${receipt.runId}:model:0:0:conversation`,
          }))?.status,
        ).toBe("failed")
      }),
    )
  })
}

it.effect("fails an empty model operation without writing an interrupted event or Session entry", () => {
  const escaped = AiError.make({
    module: "InterruptedRuntimeTest",
    method: "streamText",
    reason: AiError.UnknownError.make({ description: "terminal model failure" }),
  })
  const hosted = hostLayer({
    backend: "memory",
    label: "interrupted-empty",
    streamText: () => Stream.fail(escaped),
  })
  return scopedWith(hosted.layer)(
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const host = yield* ExecutionHost.ExecutionHost
      const receipt = yield* runtime.send({
        to: hosted.address,
        sessionId: "session:interrupted-empty",
        idempotencyKey: "empty",
        prompt: "fail empty",
      })
      yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "empty-host" }))
      const history = yield* runtime.history({ runId: receipt.runId, limit: 100 })
      expect(history.map((event) => event._tag)).toContain("RunFailed")
      expect(history.map((event) => event._tag)).not.toContain("ModelResponseInterrupted")
      expect(
        (yield* store.getOperationByKey({
          runId: receipt.runId,
          operationKey: `${receipt.runId}:model:0:0:conversation`,
        }))?.status,
      ).toBe("failed")
      const session = yield* store.sessionStore("session:interrupted-empty")
      const path = Option.isSome(session) ? yield* session.value.path() : []
      expect(
        path.some(
          (entry) =>
            entry._tag === "Message" &&
            entry.message.role === "assistant" &&
            entry.message.content.some((part) => part.type === "text"),
        ),
      ).toBe(false)
    }),
  )
})

it.effect("commits only the authoritative internal retry response", () => {
  const transient = AiError.make({
    module: "InterruptedRuntimeTest",
    method: "streamText",
    reason: AiError.RateLimitError.make({}),
  })
  let attempts = 0
  const hosted = hostLayer({
    backend: "memory",
    label: "interrupted-internal-retry",
    resilience: ModelResilience.layer({ retrySchedule: Schedule.recurs(1) }),
    streamText: () =>
      Stream.suspend(() => {
        attempts += 1
        if (attempts === 1) {
          return Stream.make(
            Response.makePart("response-metadata", {
              id: "discarded-attempt",
              modelId: "test",
              timestamp: undefined,
              request: undefined,
            }) as Response.StreamPartEncoded,
          ).pipe(Stream.concat(Stream.fail(transient)))
        }
        return Stream.make(
          Response.makePart("response-metadata", {
            id: "authoritative-attempt",
            modelId: "test",
            timestamp: undefined,
            request: undefined,
          }) as Response.StreamPartEncoded,
          Response.makePart("text-delta", { id: "answer", delta: "recovered" }),
          finish,
        )
      }),
  })
  return scopedWith(hosted.layer)(
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const host = yield* ExecutionHost.ExecutionHost
      const receipt = yield* runtime.send({
        to: hosted.address,
        sessionId: "session:interrupted-internal-retry",
        idempotencyKey: "retry",
        prompt: "retry",
      })
      yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "retry-host" }))
      const history = yield* runtime.history({ runId: receipt.runId, limit: 100 })
      expect(attempts).toBe(2)
      expect(history.map((event) => event._tag)).not.toContain("ModelResponseInterrupted")
      const committed = history.find((event) => event._tag === "ModelResponseCommitted")
      expect(committed).toMatchObject({ attempt: 1 })
      if (committed?._tag !== "ModelResponseCommitted") return
      const response = yield* runtime.resolveModelResponse(committed)
      expect(response.content.some((part) => part.type === "text" && part.text === "recovered")).toBe(true)
      expect(
        response.content.some((part) => part.type === "response-metadata" && part.id === "discarded-attempt"),
      ).toBe(false)
    }),
  )
})

it.live("rejects mutated interrupted model response references and Session storage", () => {
  const filename = tempDbPath("interrupted-hydration-corruption")
  return scopedWith(sqliteLayer(filename))(
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const sessionId = "session:interrupted-hydration-corruption"
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId,
        idempotencyKey: "interrupted-hydration-corruption",
        prompt: textPrompt("answer"),
      })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "interrupted-corruption" })
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
      const session = yield* store.sessionStore(sessionId)
      if (Option.isNone(session)) return yield* Effect.die("expected Session store")
      const prefix = yield* session.value.append({
        _tag: "Message",
        message: textPrompt("durable input").content[0]!,
      })
      const exact = interrupted(operationKey, prefix.id)
      yield* store.commitInterruptedModelResponse({
        ...claim,
        operationId: operation.operationId,
        outcome: failedOutcome,
        event: exact,
      })
      const event = (yield* runtime.history({ runId: receipt.runId, limit: 100 })).find(
        (candidate) => candidate._tag === "ModelResponseInterrupted",
      )
      if (event?._tag !== "ModelResponseInterrupted") return yield* Effect.die("expected interrupted response event")

      const assertCorrupt = (candidate: typeof event) =>
        Effect.gen(function* () {
          const error = yield* runtime.resolveModelResponse(candidate).pipe(Effect.flip)
          expect(error).toMatchObject({
            _tag: "tenetkit/runtime/SessionEntryCorrupt",
            sessionId: candidate.sessionId,
            entryId: candidate.sessionEntryId,
          })
        })

      for (const candidate of [
        { ...event, runId: "corrupt-run" },
        { ...event, operationKey: "corrupt-operation" },
        { ...event, sessionEntryId: "corrupt-entry" },
        { ...event, turn: event.turn + 1 },
        { ...event, modelCallId: "corrupt-model-call" },
        { ...event, modelAttemptId: "corrupt-model-attempt" },
        { ...event, attempt: event.attempt + 1 },
        { ...event, sessionParentId: null },
        { ...event, reason: event.reason === "cancel" ? ("failure" as const) : ("cancel" as const) },
        { ...event, digest: "corrupt-digest" },
      ]) {
        yield* assertCorrupt(candidate)
      }
      const wrongSession = yield* runtime
        .resolveModelResponse({ ...event, sessionId: "corrupt-session" })
        .pipe(Effect.flip)
      expect(wrongSession).toMatchObject({
        _tag: "tenetkit/runtime/SessionEntryNotFound",
        sessionId: "corrupt-session",
        entryId: event.sessionEntryId,
      })

      const database = new Database(filename)
      const row = database
        .query<
          { session_id: string; entry_id: string; parent_id: string | null; tag: string; payload_json: string },
          [string, string]
        >("SELECT session_id, entry_id, parent_id, tag, payload_json FROM baton_session_entries WHERE session_id = ? AND entry_id = ?")
        .get(event.sessionId, event.sessionEntryId)
      if (row === null) return yield* Effect.die("expected persisted interrupted Session entry")

      database
        .query("UPDATE baton_session_entries SET entry_id = ? WHERE session_id = ? AND entry_id = ?")
        .run("corrupt-entry", row.session_id, row.entry_id)
      const missingIdentity = yield* runtime.resolveModelResponse(event).pipe(Effect.flip)
      expect(missingIdentity).toMatchObject({
        _tag: "tenetkit/runtime/SessionEntryNotFound",
        sessionId: event.sessionId,
        entryId: event.sessionEntryId,
      })
      database
        .query("UPDATE baton_session_entries SET entry_id = ? WHERE session_id = ? AND entry_id = ?")
        .run(row.entry_id, row.session_id, "corrupt-entry")

      database
        .query("UPDATE baton_session_entries SET parent_id = NULL WHERE session_id = ? AND entry_id = ?")
        .run(row.session_id, row.entry_id)
      yield* assertCorrupt(event)
      database
        .query("UPDATE baton_session_entries SET parent_id = ? WHERE session_id = ? AND entry_id = ?")
        .run(row.parent_id, row.session_id, row.entry_id)

      database
        .query("UPDATE baton_session_entries SET tag = ? WHERE session_id = ? AND entry_id = ?")
        .run("Message", row.session_id, row.entry_id)
      yield* assertCorrupt(event)
      database
        .query("UPDATE baton_session_entries SET tag = ? WHERE session_id = ? AND entry_id = ?")
        .run(row.tag, row.session_id, row.entry_id)

      const payload = (yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(row.payload_json)) as {
        readonly _tag: string
        readonly content: ReadonlyArray<unknown>
        readonly metadata?: Readonly<Record<string, unknown>>
      }
      for (const mutated of [
        { ...payload, metadata: { ...payload.metadata, interruptionDigest: "corrupt-digest" } },
        { ...payload, _tag: "Message" },
        { ...payload, content: [{ type: "text", text: "corrupt content" }] },
      ]) {
        database
          .query("UPDATE baton_session_entries SET payload_json = ? WHERE session_id = ? AND entry_id = ?")
          .run(jsonText(mutated), row.session_id, row.entry_id)
        yield* assertCorrupt(event)
        database
          .query("UPDATE baton_session_entries SET payload_json = ? WHERE session_id = ? AND entry_id = ?")
          .run(row.payload_json, row.session_id, row.entry_id)
      }
      database.close()
      expect(yield* runtime.resolveModelResponse(event)).toEqual(exact.response)
    }),
  )
})
