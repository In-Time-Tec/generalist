import { Database } from "bun:sqlite"
import { layer as sqliteClientLayer } from "@effect/sql-sqlite-bun/SqliteClient"
import { expect, it, layer } from "@effect/vitest"
import { Deferred, Effect, Exit, Fiber, Layer, Option, Ref, Schema, Scope, Stream } from "effect"
import { LanguageModel, Prompt, Response } from "effect/unstable/ai"
import {
  Agent,
  ExecutableManifest,
  Handoff,
  Pins,
  Session,
  ToolExecutor,
  withCacheBreakpoints,
} from "../../../src/index.js"
import {
  Address,
  ExecutionHost,
  Errors,
  ExecutableResolver,
  Runtime,
  RunStore,
  RunTree,
} from "../../../src/runtime/index.js"
import { layer as activeExecutionsLayer } from "../../../src/runtime/execution/active-executions.js"
import { make as makeExecutionHost } from "../../../src/runtime/execution/host.js"
import { SCHEMA_META_TABLE, SCHEMA_VERSION, schemaChecksum } from "../../../src/runtime/sql/codec/schema.js"
import { markDirty } from "../../../src/runtime/sql/migrate.js"
import {
  alternateAssistantAddress,
  alternateAssistantRef,
  alternateResearcherRef,
  assistant,
  assistantAddress,
  assistantRef,
  completedResult,
  openWait,
  suspension,
  parentRelativeOptions,
  researcher,
  researcherAddress,
  researcherRef,
  textPrompt,
  registrationsFor,
} from "../execution/fixtures.js"
import { sqliteLayer, tempDbPath } from "./scenario.js"
import { closedTestAgent, pinnedTestAgent } from "../run/identity.js"
import { Runtime as SqliteRuntime } from "../../../src/runtime/sqlite-bun.js"
import { HandoffControlState } from "../../../src/core/agent/handoff/state.js"
const encodeJson = (value: Schema.Json): string => Schema.encodeSync(Schema.fromJsonString(Schema.Json))(value)
const CheckpointState = Schema.Struct({ handoff: Schema.optionalKey(HandoffControlState) })

const scopedWith =
  <A, E>(layerValue: Layer.Layer<A, E, never>) =>
  <B, E2, R2 extends A>(effect: Effect.Effect<B, E2, R2>): Effect.Effect<B, E | E2> =>
    Effect.scoped(Effect.flatMap(Layer.build(layerValue), (context) => effect.pipe(Effect.provideContext(context))))

const admitWaitWithClaimedChild = (waitId: string) =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore.RunStore
    const parent = yield* runtime.send({
      to: assistantAddress,
      sessionId: `session:sqlite-cancel-wait:${waitId}`,
      idempotencyKey: `sqlite-cancel-wait:${waitId}`,
      prompt: textPrompt("wait"),
    })
    const child = yield* runtime.spawn({
      parentRunId: parent.runId,
      invocationId: `child:${waitId}`,
      selection: "researcher",
      prompt: textPrompt("child"),
    })
    yield* store.claimExecution({ runId: child.runId, ownerId: "child" })
    yield* store.suspend({
      ...(yield* store.claimExecution({ runId: parent.runId, ownerId: "parent" })),
      wait: openWait({ waitId, reason: "signal" }),
      suspension: suspension({ waitId }),
    })
    return { runtime, store, runId: parent.runId }
  })

it.live("migrates and reopens a durable sqlite store", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("migrate")
    const admit = Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:1",
        idempotencyKey: "k1",
        prompt: textPrompt("hello"),
      })
      const info = yield* store.info
      expect(info).toEqual({ durability: "durable", backend: "sqlite", multiWorker: false })
      const admitted = yield* runtime.inspect(receipt.runId)
      expect(admitted.durability).toBe("durable")
      expect(admitted.executableRef).toEqual(assistantRef.ref)
      expect(admitted.executableManifest).toEqual(assistantRef.manifest)
      const child = yield* runtime.spawn({
        parentRunId: receipt.runId,
        invocationId: "reopen-child",
        selection: "researcher",
        prompt: textPrompt("child"),
      })
      const childClaim = yield* store.claimExecution({ runId: child.runId, ownerId: "child" })
      yield* store.complete({ ...childClaim, result: completedResult("child") })
      const rootClaim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "root" })
      yield* store.emitAgentEvent({
        ...rootClaim,
        event: {
          _tag: "ModelCallStarted",
          deliveryId: "reopen-call",
          turn: 0,
          modelCallId: "reopen-call",
          purpose: "conversation",
          startedAt: 1,
        },
      })
      yield* store.emitAgentEvent({
        ...rootClaim,
        event: {
          _tag: "ModelAttemptCompleted",
          deliveryId: "reopen-attempt",
          turn: 0,
          modelCallId: "reopen-call",
          modelAttemptId: "reopen-attempt",
          attempt: 0,
          completedAt: 2,
          usageAt: 2,
          usage: {
            inputTokens: { total: 2, uncached: 2, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 1, text: 1, reasoning: 0 },
          },
          finishReason: "stop",
        },
      })
      yield* store.emitAgentEvent({
        ...rootClaim,
        event: {
          _tag: "CompactionStarted",
          deliveryId: "reopen-compaction-start",
          turn: 0,
          compactionId: "reopen-compaction",
          trigger: "threshold",
          startedAt: 3,
          entriesBefore: 4,
        },
      })
      yield* store.emitAgentEvent({
        ...rootClaim,
        event: {
          _tag: "CompactionApplied",
          deliveryId: "reopen-compaction-applied",
          turn: 0,
          compactionId: "reopen-compaction",
          checkpointId: "checkpoint:reopen",
          kind: "microcompact",
          appliedAt: 4,
          commit: { compactionId: "reopen-compaction", checkpointId: "checkpoint:reopen" },
        },
      })
      yield* store.complete({ ...rootClaim, result: completedResult("root") })
      return receipt.runId
    })
    const first = yield* scopedWith(sqliteLayer(filename))(admit)
    const second = Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const inspection = yield* runtime.inspect(first)
      expect(inspection.status).toBe("succeeded")
      expect(inspection.executableRef).toEqual(assistantRef.ref)
      expect(inspection.executableManifest).toEqual(assistantRef.manifest)
      const snapshot = yield* runtime.snapshot(first)
      expect(snapshot.outcome?._tag).toBe("Succeeded")
      expect(snapshot.usage.map((fact) => fact.modelAttemptId)).toEqual(["reopen-attempt"])
      expect(snapshot.compactions.map((compaction) => compaction._tag)).toEqual(["Applied"])
      const tree = (yield* RunTree.checkpoint(first)).inspection
      expect(tree._tag).toBe("Terminal")
      expect(tree.runs.map(({ outcome }) => outcome?._tag)).toEqual(["Succeeded", "Succeeded"])
      const tags = yield* runtime.events({ runId: first, cursor: -1 }).pipe(
        Stream.take(2),
        Stream.runCollect,
        Effect.map((chunk) => [...chunk].map((event) => event._tag)),
      )
      expect(tags).toEqual(["RunAccepted", "RunAttemptStarted"])
    })
    yield* scopedWith(sqliteLayer(filename))(second)
  }),
)

layer(SqliteRuntime.layerSqlite({ filename: tempDbPath("relative-selection"), ...parentRelativeOptions }))(
  "resolves SQLite child selections relative to each persisted parent closure",
  (suite) => {
    suite.effect("resolves selections per persisted parent closure", () =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const first = yield* runtime.send({
          to: assistantAddress,
          sessionId: "sqlite:relative:first",
          idempotencyKey: "parent",
          prompt: "first",
        })
        const second = yield* runtime.send({
          to: alternateAssistantAddress,
          sessionId: "sqlite:relative:second",
          idempotencyKey: "parent",
          prompt: "second",
        })
        const firstChild = yield* runtime.spawn({
          parentRunId: first.runId,
          invocationId: "child",
          selection: "researcher",
          prompt: "child",
        })
        const secondChild = yield* runtime.spawn({
          parentRunId: second.runId,
          invocationId: "child",
          selection: "researcher",
          prompt: "child",
        })
        expect((yield* runtime.inspect(firstChild.runId)).executableRef).toEqual(researcherRef.ref)
        expect((yield* runtime.inspect(secondChild.runId)).executableRef).toEqual(alternateResearcherRef.ref)

        const before = yield* RunTree.checkpoint(first.runId)
        const failure = yield* runtime
          .spawn({
            parentRunId: first.runId,
            invocationId: "missing",
            selection: "undeclared",
            prompt: "missing",
          })
          .pipe(Effect.flip)
        expect(failure).toBeInstanceOf(Errors.ChildSelectionMissing)
        expect(yield* RunTree.checkpoint(first.runId)).toEqual(before)
      }),
    )
  },
)

it.live("resumes tree replay from an opaque cursor after close and reopen", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("tree-cursor-reopen")
    const admit = Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:tree-reopen",
        idempotencyKey: "tree-reopen",
        prompt: textPrompt("tree-reopen"),
      })
      const page = yield* RunTree.replay({ rootRunId: receipt.runId, limit: 100 })
      return { receipt, cursor: page.cursor }
    })
    const initial = yield* scopedWith(sqliteLayer(filename))(admit)
    const resume = Effect.gen(function* () {
      const store = yield* RunStore.RunStore
      const claim = yield* store.claimExecution({ runId: initial.receipt.runId, ownerId: "tree-reopen" })
      yield* store.emitAgentEvent({ ...claim, event: { _tag: "TurnStarted", turn: 1 } })
      return yield* RunTree.replay({
        rootRunId: initial.receipt.runId,
        cursor: initial.cursor,
        limit: 100,
      })
    })
    const resumed = yield* scopedWith(sqliteLayer(filename))(resume)
    expect(resumed.events.map((entry) => entry.event._tag)).toEqual(["TurnStarted"])
  }),
)

it.live("rejects dirty schema and checksum mismatch", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("dirty")
    yield* scopedWith(sqliteLayer(filename))(Effect.void)
    yield* scopedWith(sqliteClientLayer({ filename }))(markDirty(filename))
    const dirty = yield* Effect.exit(scopedWith(sqliteLayer(filename))(Effect.void))
    expect(Exit.isFailure(dirty)).toBe(true)

    const checksumFile = tempDbPath("checksum")
    yield* scopedWith(sqliteLayer(checksumFile))(Effect.void)
    const db = new Database(checksumFile)
    db.run(`UPDATE ${SCHEMA_META_TABLE} SET checksum = 'deadbeef' WHERE id = 1`)
    db.close()
    const mismatch = yield* Effect.exit(scopedWith(sqliteLayer(checksumFile))(Effect.void))
    expect(Exit.isFailure(mismatch)).toBe(true)
  }),
)

it.live("rejects unsupported forward schema versions", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("forward")
    yield* scopedWith(sqliteLayer(filename))(Effect.void)
    const db = new Database(filename)
    db.run(`UPDATE ${SCHEMA_META_TABLE} SET version = ${SCHEMA_VERSION + 5} WHERE id = 1`)
    db.close()
    const failed = yield* Effect.exit(scopedWith(sqliteLayer(filename))(Effect.void))
    expect(Exit.isFailure(failed)).toBe(true)
  }),
)

it.live("rejects multi-worker configuration", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("workers")
    const failed = yield* Effect.exit(
      scopedWith(
        SqliteRuntime.layerSqlite({
          filename,
          multiWorker: true,
          resolver: ExecutableResolver.makeStatic([]),
          addresses: [],
        }),
      )(Effect.void),
    )
    expect(Exit.isFailure(failed)).toBe(true)
  }),
)

let attestations = 0
layer(
  SqliteRuntime.layerSqlite({
    filename: tempDbPath("idem-attestation"),
    addresses: [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
    resolver: ExecutableResolver.ExecutableResolver.of({
      resolve: (input) =>
        Effect.sync(() => {
          if (input.runId === "pending") attestations += 1
          return {
            _tag: "Agent" as const,
            agent: closedTestAgent(assistant),
            attestation: { ref: assistantRef.ref, manifest: assistantRef.manifest },
          }
        }),
    }),
  }),
)("attests once and reuses the admitted Run for a duplicate", (suite) => {
  suite.effect("attests once and reuses the admitted Run", () =>
    Effect.gen(function* () {
      const send = {
        to: assistantAddress,
        sessionId: "session:idem-attestation",
        idempotencyKey: "same",
        prompt: textPrompt("one"),
      } as const
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const first = yield* runtime.send(send)
      expect(attestations).toBe(1)
      const duplicate = yield* runtime.send(send)
      expect(duplicate.duplicate).toBe(true)
      expect(duplicate.runId).toBe(first.runId)
      expect(attestations).toBe(1)
      expect(yield* store.list({ limit: 10 })).toHaveLength(1)
    }),
  )
})

layer(sqliteLayer(tempDbPath("idem")))("exact duplicate admission and changed-payload conflict", (suite) => {
  suite.effect("exact duplicate admission and changed-payload conflict", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const first = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:1",
        idempotencyKey: "same",
        prompt: textPrompt("one"),
      })
      const dup = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:1",
        idempotencyKey: "same",
        prompt: textPrompt("one"),
      })
      expect(dup.duplicate).toBe(true)
      expect(dup.runId).toBe(first.runId)
      const conflict = yield* runtime
        .send({
          to: assistantAddress,
          sessionId: "session:1",
          idempotencyKey: "same",
          prompt: textPrompt("two"),
        })
        .pipe(Effect.flip)
      expect(conflict).toBeInstanceOf(Errors.IdempotencyConflict)
    }),
  )
})

it.live("rejects an exact duplicate after the address binding changes", () => {
  const filename = tempDbPath("idem-authority")
  const send = {
    to: assistantAddress,
    sessionId: "session:authority",
    idempotencyKey: "same",
    prompt: textPrompt("same"),
  } as const
  const admit = Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    yield* runtime.send(send)
  })
  const reopen = Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore.RunStore
    const conflict = yield* runtime.send(send).pipe(Effect.flip)
    expect(conflict).toBeInstanceOf(Errors.IdempotencyConflict)
    const fresh = yield* runtime
      .send({ ...send, sessionId: "session:authority:fresh", idempotencyKey: "fresh" })
      .pipe(Effect.flip)
    expect(fresh).toBeInstanceOf(Errors.ExecutablePinMissing)
    expect(yield* store.list({ limit: 10 })).toHaveLength(1)
  })
  return Effect.gen(function* () {
    yield* scopedWith(sqliteLayer(filename))(admit)
    yield* scopedWith(
      SqliteRuntime.layerSqlite({
        filename,
        resolver: ExecutableResolver.makeStatic([]),
        addresses: [
          {
            address: assistantAddress,
            executable: alternateAssistantRef,
            registrations: registrationsFor(alternateAssistantRef),
          },
        ],
      }),
    )(reopen)
  })
})

it.live("persists a handoff checkpoint and active pin atomically across reopen", () => {
  const filename = tempDbPath("handoff-active-pin")
  let runId = ""
  let operationId = ""
  const checkpoint = {
    driverVersion: "1",
    executable: researcherRef.ref,
    turn: 1,
    budget: { allocation: {}, remaining: {}, depth: 0 },
    state: {},
  } as const
  const admit = Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore.RunStore
    const receipt = yield* runtime.send({
      to: assistantAddress,
      sessionId: "session:handoff",
      idempotencyKey: "handoff",
      prompt: textPrompt("handoff"),
    })
    runId = receipt.runId
    const claim = yield* store.claimExecution({ runId, ownerId: "handoff-a" })
    const operation = yield* store.recordOperation({
      ...claim,
      operationKey: "handoff:completed:stable",
      kind: "handoff",
      inputDigest: "handoff:stable",
      input: { targetAgentPin: researcherRef.ref.active },
      replayPolicy: "pure",
      attempt: claim.attempt,
    })
    operationId = operation.operationId
    yield* store.startOperation({ ...claim, operationId })
    expect((yield* store.getOperation({ runId, operationId })).status).toBe("running")
    expect((yield* store.loadExecution(runId)).executableRef).toEqual(assistantRef.ref)
    yield* store.completeOperation({
      ...claim,
      operationId,
      outcome: { _tag: "Succeeded", value: undefined },
      checkpoint,
    })
    const saved = yield* store.loadExecution(runId)
    expect(saved.executableRef).toEqual(researcherRef.ref)
    expect(saved.executableManifest).toEqual(assistantRef.manifest)
  })
  const reopen = Effect.gen(function* () {
    const store = yield* RunStore.RunStore
    const saved = yield* store.loadExecution(runId)
    expect((yield* store.getOperation({ runId, operationId })).status).toBe("succeeded")
    expect(saved.checkpoint).toEqual(checkpoint)
    expect(saved.executableRef).toEqual(researcherRef.ref)
    expect(saved.executableManifest).toEqual(assistantRef.manifest)
  })
  return Effect.gen(function* () {
    yield* scopedWith(sqliteLayer(filename))(admit)
    yield* scopedWith(sqliteLayer(filename))(reopen)
  })
})

it.live("atomically imports SQLite handoff projections with exact retry and divergent rollback", () => {
  const filename = tempDbPath("handoff-session-projection")
  let runId = ""
  let operationId = ""
  const operationKey = "handoff:sqlite-projection"
  const projectedHistory = Prompt.make("projected-for-specialist")
  const checkpoint = {
    driverVersion: "1" as const,
    executable: researcherRef.ref,
    turn: 1,
    budget: { allocation: {}, remaining: {}, depth: 0 },
    state: {},
  }
  const commit = Schema.decodeSync(Handoff.HandoffCommit)({
    _tag: "HandoffCommit",
    state: {
      root: assistant.name,
      active: researcher.name,
      path: [{ handoffId: operationKey, source: assistant.name, target: researcher.name, turn: 0 }],
      edgeCounts: [{ source: assistant.name, target: researcher.name, count: 1 }],
      handoffCount: 1,
      pendingContinuation: { prompt: Prompt.make("continue") },
    },
    sessionEntryId: `${operationKey}:session-projection`,
    sessionParentId: null,
    projectedHistory,
    targetAgentPin: Pins.AgentPin.make(researcherRef.ref.active),
  })
  const commitAndRetry = Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore.RunStore
    const receipt = yield* runtime.send({
      to: assistantAddress,
      sessionId: "session:sqlite-handoff-projection",
      idempotencyKey: "sqlite-handoff-projection",
      prompt: "supervisor sentinel",
    })
    runId = receipt.runId
    const claim = yield* store.claimExecution({ runId, ownerId: "handoff-projection-a" })
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
    const completion = {
      ...claim,
      operationId,
      outcome: { _tag: "Succeeded" as const, value: commit },
      checkpoint,
    }
    const invalidProjection = yield* store
      .completeOperation({
        ...completion,
        outcome: {
          _tag: "Succeeded",
          value: {
            ...commit,
            projectedHistory: Prompt.fromMessages([Prompt.makeMessage("system", { content: "must not persist" })]),
          },
        },
      })
      .pipe(Effect.flip)
    expect(invalidProjection).toBeInstanceOf(Errors.RuntimeUnavailable)
    expect((yield* store.getOperation({ runId, operationId })).status).toBe("running")
    expect((yield* store.loadExecution(runId)).executableRef).toEqual(assistantRef.ref)
    yield* store.completeOperation(completion)
    const retryCompletion = {
      ...completion,
      outcome: { _tag: "Succeeded" as const, value: commit },
    }
    const session = yield* store.claimedSessionStore(claim)
    if (Option.isNone(session)) return yield* Effect.die("expected SQLite Session")
    yield* session.value.append({ _tag: "Message", message: Prompt.make("descendant").content[0]! })
    const beforeDivergence = yield* session.value.path()
    const divergentCheckpoint = yield* store
      .completeOperation({ ...retryCompletion, checkpoint: { ...checkpoint, state: { divergent: true } } })
      .pipe(Effect.flip)
    expect(divergentCheckpoint).toBeInstanceOf(Errors.RuntimeUnavailable)
    const divergent = yield* store
      .completeOperation({
        ...retryCompletion,
        outcome: {
          _tag: "Succeeded",
          value: { ...commit, projectedHistory: Prompt.make("divergent projection") },
        },
      })
      .pipe(Effect.flip)
    expect(divergent).toBeInstanceOf(Errors.RuntimeUnavailable)
    expect(yield* session.value.path()).toEqual(beforeDivergence)
    expect(Session.buildContext(beforeDivergence)).toEqual(Prompt.concat(projectedHistory, Prompt.make("descendant")))
    expect((yield* store.loadExecution(runId)).executableRef).toEqual(researcherRef.ref)
  })
  const reopen = Effect.gen(function* () {
    const store = yield* RunStore.RunStore
    expect((yield* store.getOperation({ runId, operationId })).status).toBe("succeeded")
    const session = yield* store.sessionReader("session:sqlite-handoff-projection")
    if (Option.isNone(session)) return yield* Effect.die("expected reopened SQLite Session")
    expect(Session.buildContext(yield* session.value.path())).toEqual(
      Prompt.concat(projectedHistory, Prompt.make("descendant")),
    )
    expect((yield* store.loadExecution(runId)).executableRef).toEqual(researcherRef.ref)
  })
  return Effect.gen(function* () {
    yield* scopedWith(sqliteLayer(filename))(commitAndRetry)
    yield* scopedWith(sqliteLayer(filename))(reopen)
  })
})

it.live("requires explicit resolution of a handoff tool interrupted after its inner commit", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("execution-host-handoff-reopen")
    const childAgent = Agent.make({ name: "durable-specialist" })
    const child = pinnedTestAgent(childAgent, "handoff-b")
    const specialist = Handoff.target(childAgent, child.pin)
    const supervisor = Handoff.supervisor({
      name: "durable-supervisor",
      specialists: [specialist],
      handoffOptions: {
        maxRepeatedEdge: 2,
        projection: () =>
          Effect.succeed({
            history: Prompt.make("projected-for-specialist"),
            prompt: Prompt.make("continue with committed context"),
          }),
      },
    })
    const root = pinnedTestAgent(supervisor.agent, "handoff-a", [{ selection: childAgent.name }])
    const admittedExecutable = ExecutableManifest.make({
      root: root.pin,
      profiles: [{ selection: childAgent.name, agent: child.pin }],
      entries: [
        { _tag: "Agent", ...root },
        { _tag: "Agent", ...child },
      ],
    })
    const activeExecutable = ExecutableManifest.make({
      root: root.pin,
      active: child.pin,
      profiles: admittedExecutable.manifest.profiles,
      entries: [
        { _tag: "Agent", ...root },
        { _tag: "Agent", ...child },
      ],
    })
    const address = Address.make("agent:durable-handoff")
    const continuation = Prompt.make("continue with committed context")
    const finish = Response.makePart("finish", {
      reason: "stop",
      usage: Response.Usage.make({
        inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
      }),
      response: undefined,
    })
    const firstModel = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () =>
          Stream.fromIterable<Response.StreamPartEncoded>([
            Response.makePart("tool-call", {
              id: "handoff-a-to-b",
              name: `handoff_to_${childAgent.name}`,
              params: { prompt: "continue with committed context", reason: "specialist owns completion" },
              providerExecuted: false,
            }),
            finish,
          ]),
      }),
    )
    const firstServices = Layer.mergeAll(
      firstModel,
      ToolExecutor.layerToolkit(supervisor.toolkit),
      supervisor.catalog,
      supervisor.agent.toolkit.toLayer(
        supervisor.agent.toolkit.of({
          [`handoff_to_${childAgent.name}`]: () => Effect.die("ToolExecutor owns handoff tool execution"),
        }),
      ),
    )
    const firstResolver = ExecutableResolver.ExecutableResolver.of({
      resolve: () =>
        Effect.succeed({
          _tag: "Agent" as const,
          agent: Agent.close(supervisor.agent, firstServices),
          attestation: admittedExecutable,
        }),
    })
    const crashScope = yield* Scope.make()
    const committed = Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const handoffCommitted = yield* Deferred.make<void>()
      const crashStore = RunStore.RunStore.of({
        ...store,
        completeOperation: (input) =>
          store
            .completeOperation(input)
            .pipe(
              Effect.flatMap((record) =>
                record.kind === "handoff"
                  ? Deferred.succeed(handoffCommitted, undefined).pipe(Effect.andThen(Effect.never))
                  : Effect.succeed(record),
              ),
            ),
      })
      const crashHost = yield* scopedWith(activeExecutionsLayer)(
        makeExecutionHost({ workerId: "before-reopen", resolver: firstResolver }).pipe(
          Effect.provideService(RunStore.RunStore, crashStore),
        ),
      )
      const receipt = yield* runtime.send({
        to: address,
        sessionId: "session:durable-handoff",
        idempotencyKey: "durable-handoff",
        prompt: "start with the supervisor",
      })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "before-reopen" })
      const fiber = yield* crashHost.execute(claim).pipe(Effect.forkIn(crashScope))
      yield* Deferred.await(handoffCommitted)
      const execution = yield* store.loadExecution(receipt.runId)
      const checkpointState = yield* Schema.decodeUnknownEffect(CheckpointState)(
        execution.checkpoint !== undefined && "state" in execution.checkpoint ? execution.checkpoint.state : {},
      )
      const operation = yield* store.getOperationByKey({
        runId: receipt.runId,
        operationKey: checkpointState?.handoff?.path[0]?.handoffId ?? "missing",
      })
      const session = yield* store.sessionReader("session:durable-handoff")
      if (Option.isNone(session)) return yield* Effect.die("expected durable Session")
      const sessionPath = yield* session.value.path()
      return { runId: receipt.runId, fiber, execution, operation, sessionPath }
    })
    const committedResult = yield* scopedWith(
      SqliteRuntime.layerSqlite({
        filename,
        resolver: firstResolver,
        addresses: [
          {
            address,
            executable: admittedExecutable,
            registrations: registrationsFor(admittedExecutable),
          },
        ],
      }),
    )(committed)

    yield* Fiber.interrupt(committedResult.fiber)
    expect(committedResult.operation?.status).toBe("succeeded")
    expect(committedResult.execution.executableRef).toEqual(activeExecutable.ref)
    expect(committedResult.sessionPath.at(-1)).toMatchObject({
      _tag: "Handoff",
      target: childAgent.name,
      projectedHistory: Prompt.make("projected-for-specialist"),
    })
    expect(Session.buildContext(committedResult.sessionPath)).toEqual(Prompt.make("projected-for-specialist"))
    const handoffEntryJson = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(
      committedResult.sessionPath.at(-1),
    )
    expect(handoffEntryJson).not.toContain("start with the supervisor")
    const committedState = yield* Schema.decodeUnknownEffect(CheckpointState)(
      committedResult.execution.checkpoint !== undefined && "state" in committedResult.execution.checkpoint
        ? committedResult.execution.checkpoint.state
        : {},
    )
    expect(committedState.handoff).toMatchObject({
      active: childAgent.name,
      path: [{ source: supervisor.agent.name, target: childAgent.name }],
      edgeCounts: [{ source: supervisor.agent.name, target: childAgent.name, count: 1 }],
      handoffCount: 1,
      pendingContinuation: { prompt: continuation },
    })
    let resolvedActive: string | undefined
    let receivedByChild: Prompt.Prompt | undefined
    const childModel = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: (options) => {
          receivedByChild = options.prompt
          return Stream.fromIterable<Response.StreamPartEncoded>([
            Response.makePart("text-delta", { id: "child-answer", delta: "completed by specialist" }),
            finish,
          ])
        },
      }),
    )
    const reopenResolver = ExecutableResolver.ExecutableResolver.of({
      resolve: (input) =>
        Effect.sync(() => {
          resolvedActive = input.ref.active
          return {
            _tag: "Agent" as const,
            agent: Agent.close(childAgent, childModel),
            attestation: activeExecutable,
          }
        }),
    })
    const reopen = Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const host = yield* ExecutionHost.ExecutionHost
      const session = yield* store.sessionReader("session:durable-handoff")
      if (Option.isNone(session)) return yield* Effect.die("expected durable Session")
      const conversationBeforeContinuation = Session.buildContext(yield* session.value.path())
      const claim = yield* store.claimExecution({ runId: committedResult.runId, ownerId: "after-reopen" })
      yield* host.execute(claim)
      expect((yield* runtime.inspect(committedResult.runId)).status).toBe("needs-resolution")
      expect(resolvedActive).toBeUndefined()
      const history = yield* runtime.history({ runId: committedResult.runId, cursor: -1, limit: 100 })
      const unknown = history.findLast((event) => event._tag === "OperationUnknown")
      if (unknown?._tag !== "OperationUnknown" || committedResult.operation === undefined) {
        return yield* Effect.die("interrupted handoff operation recovery is missing")
      }
      const accepted = {
        _tag: "HandoffAccepted" as const,
        handoffId: committedResult.operation.operationKey,
        source: supervisor.agent.name,
        target: childAgent.name,
      }
      yield* runtime.resolveOperation({
        runId: committedResult.runId,
        operationId: unknown.operationId,
        idempotencyKey: "resolve:committed-handoff-tool",
        resolution: {
          _tag: "Succeeded",
          value: { _tag: "Success", result: accepted, encodedResult: accepted },
        },
      })
      const resumed = yield* store.claimExecution({ runId: committedResult.runId, ownerId: "after-resolution" })
      yield* host.execute(resumed)
      expect(resolvedActive).toBe(child.pin)
      expect((yield* runtime.inspect(committedResult.runId)).status).toBe("succeeded")
      expect(
        (yield* runtime.history({ runId: committedResult.runId, cursor: -1, limit: 100 })).map((event) => event._tag),
      ).not.toContain("RunFailed")
      const completed = yield* store.loadExecution(committedResult.runId)
      const completedState = yield* Schema.decodeUnknownEffect(CheckpointState)(
        completed.checkpoint !== undefined && "state" in completed.checkpoint ? completed.checkpoint.state : {},
      )
      expect(completedState.handoff).toMatchObject({
        active: childAgent.name,
        path: [{ source: supervisor.agent.name, target: childAgent.name }],
        edgeCounts: [{ source: supervisor.agent.name, target: childAgent.name, count: 1 }],
        handoffCount: 1,
      })
      expect(completedState.handoff?.pendingContinuation).toBeUndefined()
      const expectedSpecialistInput = Prompt.concat(Prompt.make("projected-for-specialist"), continuation)
      expect(conversationBeforeContinuation).toEqual(Prompt.make("projected-for-specialist"))
      expect(receivedByChild?.content.filter((message) => message.role !== "system")).toEqual(
        withCacheBreakpoints(expectedSpecialistInput, "conversation", undefined).content,
      )
      const receivedJson = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(receivedByChild)
      expect(receivedJson).not.toContain("start with the supervisor")
    })
    yield* scopedWith(
      SqliteRuntime.layerSqlite({
        filename,
        resolver: reopenResolver,
        addresses: [
          {
            address,
            executable: admittedExecutable,
            registrations: registrationsFor(admittedExecutable),
          },
        ],
      }),
    )(reopen)
  }),
)

it.live("rejects corrupted persisted executable authority with RuntimeUnavailable", () => {
  const filename = tempDbPath("corrupt-authority")
  let runId = ""
  const admit = Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    runId = (yield* runtime.send({
      to: assistantAddress,
      sessionId: "session:corrupt",
      idempotencyKey: "corrupt",
      prompt: textPrompt("corrupt"),
    })).runId
  })
  const corrupt = Effect.sync(() => {
    const db = new Database(filename)
    db.run("UPDATE tenetkit_runs SET executable_ref_json = ? WHERE run_id = ?", [
      encodeJson(alternateAssistantRef.ref),
      runId,
    ])
    db.close()
  })
  const reopen = Effect.gen(function* () {
    const store = yield* RunStore.RunStore
    const error = yield* store.loadExecution(runId).pipe(Effect.flip)
    expect(error).toBeInstanceOf(Errors.RuntimeUnavailable)
  })
  return Effect.gen(function* () {
    yield* scopedWith(sqliteLayer(filename))(admit)
    yield* corrupt
    yield* scopedWith(sqliteLayer(filename))(reopen)
  })
})

it.live("persists only complete atomic failure, unknown, and suspension states across reopen", () => {
  const filename = tempDbPath("atomic-crash-states")
  const runIds: Record<string, string> = {}
  const checkpoint = {
    driverVersion: "1" as const,
    executable: assistantRef.ref,
    turn: 2,
    budget: { allocation: {}, remaining: {}, depth: 0 },
    state: { committed: true },
  }
  const write = Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore.RunStore
    for (const outcome of [{ _tag: "Failed" as const, error: { message: "failed" } }, { _tag: "Unknown" as const }]) {
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: `session:sqlite:${outcome._tag}`,
        idempotencyKey: outcome._tag,
        prompt: outcome._tag,
      })
      runIds[outcome._tag] = receipt.runId
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "atomic" })
      const operation = yield* store.recordOperation({
        ...claim,
        operationKey: `tool:${outcome._tag}`,
        kind: "tool",
        inputDigest: outcome._tag,
        input: {},
        replayPolicy: "never",
        attempt: claim.attempt,
      })
      yield* store.startOperation({ ...claim, operationId: operation.operationId })
      expect((yield* store.loadExecution(receipt.runId)).checkpoint).toBeUndefined()
      yield* store.completeOperation({ ...claim, operationId: operation.operationId, outcome, checkpoint })
    }
    const suspended = yield* runtime.send({
      to: assistantAddress,
      sessionId: "session:sqlite:suspended",
      idempotencyKey: "suspended",
      prompt: "suspended",
    })
    runIds.Suspended = suspended.runId
    const claim = yield* store.claimExecution({ runId: suspended.runId, ownerId: "atomic" })
    yield* store.suspend({
      ...claim,
      checkpoint,
      suspension: suspension({ waitId: "approval", reason: "approval" }),
      wait: openWait({ waitId: "approval", reason: "approval" }),
    })
  })
  const reopen = Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore.RunStore
    for (const [tag, expectedStatus] of [
      ["Failed", "failed"],
      ["Unknown", "unknown"],
    ] as const) {
      const operation = yield* store.getOperationByKey({ runId: runIds[tag]!, operationKey: `tool:${tag}` })
      expect(operation?.status).toBe(expectedStatus)
      expect((yield* store.loadExecution(runIds[tag]!)).checkpoint).toEqual(checkpoint)
    }
    expect((yield* runtime.inspect(runIds.Unknown!)).status).toBe("needs-resolution")
    const execution = yield* store.loadExecution(runIds.Suspended!)
    expect(execution.checkpoint).toEqual(checkpoint)
    expect(execution.suspension).toMatchObject({
      _tag: "tenetkit/core/AgentSuspended",
      token: "approval",
      reason: "approval",
      tool_call_id: "approval",
    })
    expect((yield* runtime.inspect(runIds.Suspended!)).wait?.waitId).toBe("approval")
    expect((yield* runtime.inspect(runIds.Suspended!)).status).toBe("waiting")
  })
  return Effect.gen(function* () {
    yield* scopedWith(sqliteLayer(filename))(write)
    yield* scopedWith(sqliteLayer(filename))(reopen)
  })
})

it.live("persists caller RunId, wait resolution, and finite inspection reads across reopen", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("protocol-foundation")
    const admit = Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        runId: "run:sqlite:caller",
        to: assistantAddress,
        sessionId: "session:sqlite:caller",
        idempotencyKey: "sqlite:caller",
        prompt: textPrompt("wait"),
      })
      expect(receipt.runId).toBe("run:sqlite:caller")
      yield* store.suspend({
        ...(yield* store.claimExecution({ runId: receipt.runId, ownerId: "test" })),
        runId: receipt.runId,
        wait: openWait({ waitId: "wait:sqlite" }),
        suspension: suspension({ waitId: "wait:sqlite" }),
      })
      yield* runtime.respond({
        runId: receipt.runId,
        waitId: "wait:sqlite",
        resolution: { _tag: "ToolResult", result: "yes", encodedResult: "yes" },
      })
    })
    const reopen = Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const inspection = yield* runtime.inspect("run:sqlite:caller")
      expect(inspection.wait?.resolution).toEqual({ _tag: "ToolResult", result: "yes", encodedResult: "yes" })
      expect((yield* runtime.snapshot("run:sqlite:caller")).cursor).toBe(inspection.lastSequence)
      expect((yield* runtime.history({ runId: "run:sqlite:caller", limit: 1 })).length).toBe(1)
      expect((yield* runtime.list({ limit: 10 })).map((run) => run.runId)).toContain("run:sqlite:caller")
      const conflict = yield* runtime
        .send({
          runId: "run:sqlite:caller",
          to: assistantAddress,
          sessionId: "session:sqlite:caller",
          idempotencyKey: "different",
          prompt: textPrompt("different"),
        })
        .pipe(Effect.flip)
      expect(conflict).toBeInstanceOf(Errors.RunIdConflict)
    })
    yield* scopedWith(sqliteLayer(filename))(admit)
    yield* scopedWith(sqliteLayer(filename))(reopen)
  }),
)

layer(sqliteLayer(tempDbPath("direct-resume")))(
  "persists and strictly replays the exact resolution supplied to RunStore.resume",
  (suite) => {
    suite.effect("persists and replays the exact resolution", () =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: "session:sqlite:direct-resume",
          idempotencyKey: "direct-resume",
          prompt: textPrompt("wait"),
        })
        const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "direct-resume" })
        yield* store.suspend({
          ...claim,
          wait: openWait({ waitId: "wait:direct-resume" }),
          suspension: suspension({ waitId: "wait:direct-resume" }),
        })
        const resolution = {
          _tag: "ToolResult" as const,
          result: { approved: true, values: [1, 2, 3] },
          encodedResult: { format: "json", value: "approved" },
        }
        const resumeInput = { runId: receipt.runId, waitId: "wait:direct-resume", resolution }
        yield* store.resume(resumeInput)

        const resumed = (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 10 })).find(
          (event) => event._tag === "RunResumed",
        )
        expect(resumed).toEqual(
          expect.objectContaining({ _tag: "RunResumed", waitId: "wait:direct-resume", resolution }),
        )
      }),
    )
  },
)

layer(sqliteLayer(tempDbPath("cancelled-wait")))(
  "does not resume a SQLite Run after cancellation admission",
  (suite) => {
    suite.effect("does not resume after cancellation admission", () =>
      Effect.gen(function* () {
        const { runtime, store, runId } = yield* admitWaitWithClaimedChild("wait:sqlite-cancelled")
        yield* runtime.cancel({ runId, reason: "stop" })
        expect((yield* runtime.inspect(runId)).status).toBe("cancelling")

        const response = yield* runtime
          .respond({
            runId,
            waitId: "wait:sqlite-cancelled",
            resolution: { _tag: "ToolResult", result: "yes", encodedResult: "yes" },
          })
          .pipe(Effect.flip)
        expect(response).toBeInstanceOf(Errors.WaitNotOpen)
        yield* runtime.signal({ runId, name: "wait:sqlite-cancelled" })
        const resume = yield* store
          .resume({
            runId,
            waitId: "wait:sqlite-cancelled",
            resolution: { _tag: "ToolResult", result: "yes", encodedResult: "yes" },
          })
          .pipe(Effect.flip)
        expect(resume).toBeInstanceOf(Errors.WaitNotOpen)
        expect((yield* runtime.inspect(runId)).status).toBe("cancelling")
      }),
    )
  },
)

layer(sqliteLayer(tempDbPath("cancelled-wait-race")))(
  "keeps a concurrent SQLite response and cancellation from leaving a Run running",
  (suite) => {
    suite.effect("keeps response and cancellation concurrent", () =>
      Effect.gen(function* () {
        const { runtime, runId } = yield* admitWaitWithClaimedChild("wait:sqlite-race")
        yield* Effect.all(
          [
            runtime
              .respond({
                runId,
                waitId: "wait:sqlite-race",
                resolution: { _tag: "ToolResult", result: "yes", encodedResult: "yes" },
              })
              .pipe(Effect.exit),
            runtime.cancel({ runId, reason: "stop" }).pipe(Effect.exit),
          ],
          { concurrency: "unbounded" },
        )
        expect((yield* runtime.inspect(runId)).status).toBe("cancelling")
      }),
    )
  },
)

layer(sqliteLayer(tempDbPath("fifo")))("fifo blocks successors until head terminals", (suite) => {
  suite.effect("fifo blocks successors until head terminals", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore.RunStore
      const head = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:fifo",
        idempotencyKey: "a",
        prompt: textPrompt("a"),
      })
      const blocked = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:fifo",
        idempotencyKey: "b",
        prompt: textPrompt("b"),
      })
      expect((yield* runtime.inspect(head.runId)).status).toBe("running")
      expect((yield* runtime.inspect(blocked.runId)).status).toBe("queued")
      yield* driver.complete({
        ...(yield* driver.claimExecution({ runId: head.runId, ownerId: "test" })),
        runId: head.runId,
        result: completedResult("done"),
      })
      expect((yield* runtime.inspect(blocked.runId)).status).toBe("running")
    }),
  )

  suite.effect("serializes one Session across different addresses", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore.RunStore
      const sessionId = "session:sqlite-cross-address"
      const head = yield* runtime.send({
        to: assistantAddress,
        sessionId,
        idempotencyKey: "same-key",
        prompt: textPrompt("assistant"),
      })
      const blocked = yield* runtime.send({
        to: researcherAddress,
        sessionId,
        idempotencyKey: "same-key",
        prompt: textPrompt("researcher"),
      })

      expect(blocked.runId).not.toBe(head.runId)
      expect(blocked.acceptedSequence).toBe(1)
      expect((yield* runtime.inspect(blocked.runId)).status).toBe("queued")
      yield* driver.complete({
        ...(yield* driver.claimExecution({ runId: head.runId, ownerId: "test" })),
        result: completedResult("done"),
      })
      expect((yield* runtime.inspect(blocked.runId)).status).toBe("running")
    }),
  )
})

layer(sqliteLayer(tempDbPath("control")))("response signal and cancel bypass the lane", (suite) => {
  suite.effect("response signal and cancel bypass the lane", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore.RunStore
      const waiting = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:control",
        idempotencyKey: "wait",
        prompt: textPrompt("wait"),
      })
      const successor = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:control",
        idempotencyKey: "next",
        prompt: textPrompt("next"),
      })
      yield* driver.suspend({
        ...(yield* driver.claimExecution({ runId: waiting.runId, ownerId: "test" })),
        runId: waiting.runId,
        wait: openWait({ waitId: "approval", reason: "approval" }),
        suspension: suspension({ waitId: "approval", reason: "approval" }),
      })
      expect((yield* runtime.inspect(successor.runId)).status).toBe("queued")
      yield* runtime.respond({ runId: waiting.runId, waitId: "approval", resolution: { _tag: "Approved" } })
      expect((yield* runtime.inspect(waiting.runId)).status).toBe("running")
      yield* driver.suspend({
        ...(yield* driver.claimExecution({ runId: waiting.runId, ownerId: "test" })),
        runId: waiting.runId,
        wait: openWait({ waitId: "signal-me", reason: "signal" }),
        suspension: suspension({ waitId: "signal-me" }),
      })
      yield* runtime.signal({ runId: waiting.runId, name: "signal-me" })
      expect((yield* runtime.inspect(waiting.runId)).status).toBe("running")
      yield* runtime.cancel({ runId: waiting.runId, reason: "stop" })
      expect((yield* runtime.inspect(waiting.runId)).status).toBe("cancelled")
      expect((yield* runtime.inspect(successor.runId)).status).toBe("running")
    }),
  )
})

layer(sqliteLayer(tempDbPath("fence")))("attempt fencing is monotonic across promote", (suite) => {
  suite.effect("attempt fencing is monotonic across promote", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore.RunStore
      const first = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:fence",
        idempotencyKey: "a",
        prompt: textPrompt("a"),
      })
      const second = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:fence",
        idempotencyKey: "b",
        prompt: textPrompt("b"),
      })
      const firstEvents = yield* runtime.events({ runId: first.runId }).pipe(
        Stream.take(2),
        Stream.runCollect,
        Effect.map((chunk) => [...chunk]),
      )
      const started = firstEvents.find((event) => event._tag === "RunAttemptStarted")
      expect(started !== undefined && started._tag === "RunAttemptStarted" ? started.attempt : 0).toBe(1)
      yield* driver.complete({
        ...(yield* driver.claimExecution({ runId: first.runId, ownerId: "test" })),
        runId: first.runId,
        result: completedResult("done"),
      })
      const secondEvents = yield* runtime.events({ runId: second.runId }).pipe(
        Stream.take(2),
        Stream.runCollect,
        Effect.map((chunk) => [...chunk]),
      )
      const secondStarted = secondEvents.find((event) => event._tag === "RunAttemptStarted")
      expect(
        secondStarted !== undefined && secondStarted._tag === "RunAttemptStarted" ? secondStarted.attempt : 0,
      ).toBe(1)
    }),
  )
})

layer(sqliteLayer(tempDbPath("ops")))("expired non-idempotent running operations become unknown", (suite) => {
  suite.effect("expired non-idempotent running operations become unknown", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:ops",
        idempotencyKey: "op",
        prompt: textPrompt("op"),
      })
      const recorded = yield* driver.recordOperation({
        ...(yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })),
        runId: receipt.runId,
        operationKey: "tool:counter",
        kind: "tool",
        inputDigest: "digest:1",
        input: { n: 1 },
        replayPolicy: "never",
        attempt: 1,
      })
      const operationClaim = yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })
      const staleSession = Option.getOrThrow(yield* driver.claimedSessionStore(operationClaim))
      yield* staleSession.append({ _tag: "Message", message: textPrompt("before resolution").content[0]! })
      yield* driver.startOperation({ ...operationClaim, operationId: recorded.operationId })
      const expired = yield* driver.expireRunningOperation({
        ...operationClaim,
        operationId: recorded.operationId,
      })
      expect(expired.outcome).toBe("unknown")
      expect(expired.record.status).toBe("unknown")
      expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
      expect((yield* driver.claimExecution({ runId: receipt.runId, ownerId: "other" }).pipe(Effect.flip))._tag).toBe(
        "tenetkit/runtime/RuntimeUnavailable",
      )
      const resolution = {
        _tag: "Failed" as const,
        error: { message: "uncertain", details: { recoverable: false, source: "operator" } },
      }
      yield* runtime.resolveOperation({
        runId: receipt.runId,
        operationId: recorded.operationId,
        idempotencyKey: "resolve:1",
        resolution: {
          _tag: "Failed",
          error: { details: { source: "operator", recoverable: false }, message: "uncertain" },
        },
      })
      expect(
        yield* Effect.flip(
          staleSession.append({ _tag: "Message", message: textPrompt("stale after resolution").content[0]! }),
        ),
      ).toMatchObject({ message: "Session write claim is stale" })
      yield* runtime.resolveOperation({
        runId: receipt.runId,
        operationId: recorded.operationId,
        idempotencyKey: "resolve:1",
        resolution,
      })
      const conflict = yield* runtime
        .resolveOperation({
          runId: receipt.runId,
          operationId: recorded.operationId,
          idempotencyKey: "resolve:1",
          resolution: {
            _tag: "Failed",
            error: { message: "different", details: { recoverable: false, source: "operator" } },
          },
        })
        .pipe(Effect.flip)
      expect(conflict).toBeInstanceOf(Errors.OperationResolutionConflict)
      const resolvedClaim = yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })
      expect(BigInt(resolvedClaim.session.epoch)).toBeGreaterThan(BigInt(operationClaim.session.epoch))
      const replacementSession = Option.getOrThrow(yield* driver.claimedSessionStore(resolvedClaim))
      yield* replacementSession.append({
        _tag: "Message",
        message: textPrompt("replacement after resolution").content[0]!,
      })
      const consumed = yield* driver.recordOperation({
        ...resolvedClaim,
        runId: receipt.runId,
        operationKey: "tool:counter",
        kind: "tool",
        inputDigest: "digest:1",
        input: { n: 1 },
        replayPolicy: "never",
        attempt: resolvedClaim.attempt,
      })
      expect(consumed.status).toBe("failed")
      expect(consumed.error).toEqual({
        message: "uncertain",
        details: { recoverable: false, source: "operator" },
      })
      const pure = yield* driver.recordOperation({
        ...resolvedClaim,
        runId: receipt.runId,
        operationKey: "model:pure",
        kind: "model",
        inputDigest: "digest:2",
        input: { prompt: "x" },
        replayPolicy: "pure",
        attempt: 1,
      })
      yield* driver.startOperation({ ...resolvedClaim, operationId: pure.operationId })
      const retried = yield* driver.expireRunningOperation({
        ...resolvedClaim,
        operationId: pure.operationId,
      })
      expect(retried.outcome).toBe("retried")
      expect(retried.record.status).toBe("requested")
    }),
  )
})

layer(sqliteLayer(tempDbPath("terminal")))("first terminal wins", (suite) => {
  suite.effect("first terminal wins", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:term",
        idempotencyKey: "t",
        prompt: textPrompt("t"),
      })
      const claim = yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })
      yield* driver.complete({ ...claim, result: completedResult("ok") })
      const again = yield* driver
        .fail({ ...claim, error: Errors.AgentExecutionFailure.make({ message: "nope" }) })
        .pipe(Effect.flip)
      expect(again).toBeInstanceOf(Errors.StaleClaim)
      expect((yield* runtime.inspect(receipt.runId)).status).toBe("succeeded")
    }),
  )
})

const rollbackPublicationFilename = tempDbPath("rollback-publication")
layer(sqliteLayer(rollbackPublicationFilename))("publishes SQL events only after commit", (suite) => {
  suite.effect("hides rolled-back events and publishes committed events once in order", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:rollback-publication",
        idempotencyKey: "parent",
        prompt: textPrompt("parent"),
      })
      const before = yield* runtime.history({ runId: parent.runId, cursor: -1, limit: 100 })
      const lastSequence = before.at(-1)!.sequence
      const observed = yield* Ref.make<Array<number>>([])
      const subscribed = yield* Deferred.make<void>()
      const committed = yield* Deferred.make<void>()
      const subscriber = yield* runtime.events({ runId: parent.runId, cursor: lastSequence - 1 }).pipe(
        Stream.tap((event) =>
          Ref.update(observed, (sequences) => [...sequences, event.sequence]).pipe(
            Effect.andThen(
              event.sequence === lastSequence
                ? Deferred.succeed(subscribed, undefined)
                : Deferred.succeed(committed, undefined),
            ),
          ),
        ),
        Stream.runDrain,
        Effect.forkChild({ startImmediately: true }),
      )
      yield* Deferred.await(subscribed)

      const database = yield* Effect.acquireRelease(
        Effect.sync(() => new Database(rollbackPublicationFilename)),
        (connection) => Effect.sync(() => connection.close()),
      )
      const parentId = parent.runId.replaceAll("'", "''")
      database.run(`
        CREATE TRIGGER fail_spawn_after_parent_event
        BEFORE INSERT ON tenetkit_run_events
        WHEN NEW.run_id <> '${parentId}'
        BEGIN
          SELECT RAISE(ABORT, 'forced post-append failure');
        END
      `)
      const failed = yield* runtime
        .spawn({
          parentRunId: parent.runId,
          invocationId: "rolled-back-child",
          selection: "researcher",
          prompt: textPrompt("rolled back"),
        })
        .pipe(Effect.exit)
      expect(Exit.isFailure(failed)).toBe(true)
      yield* Effect.yieldNow

      expect(yield* runtime.history({ runId: parent.runId, cursor: -1, limit: 100 })).toEqual(before)
      expect(yield* Ref.get(observed)).toEqual([lastSequence])

      database.run("DROP TRIGGER fail_spawn_after_parent_event")
      yield* runtime.spawn({
        parentRunId: parent.runId,
        invocationId: "committed-child",
        selection: "researcher",
        prompt: textPrompt("committed"),
      })
      yield* Deferred.await(committed)

      const after = yield* runtime.history({ runId: parent.runId, cursor: -1, limit: 100 })
      expect(after.map((event) => event.sequence)).toEqual([...before.map((event) => event.sequence), lastSequence + 1])
      expect(after.at(-1)?._tag).toBe("ChildLinked")
      expect(yield* Ref.get(observed)).toEqual([lastSequence, lastSequence + 1])
      yield* Fiber.interrupt(subscriber)
    }),
  )
})

layer(sqliteLayer(tempDbPath("terminal-parent-spawn")))("rejects child admission after a terminal parent", (suite) => {
  suite.effect("rejects child admission after a terminal parent", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:terminal-parent-spawn",
        idempotencyKey: "parent",
        prompt: textPrompt("parent"),
      })
      const claim = yield* store.claimExecution({ runId: parent.runId, ownerId: "test" })
      yield* store.complete({ ...claim, result: completedResult("done") })
      const failure = yield* runtime
        .spawn({
          parentRunId: parent.runId,
          invocationId: "too-late",
          selection: "researcher",
          prompt: textPrompt("child"),
        })
        .pipe(Effect.flip)
      expect(failure).toBeInstanceOf(Errors.RunTerminal)
      expect((yield* RunTree.checkpoint(parent.runId)).inspection.runs).toHaveLength(1)
    }),
  )
})

layer(sqliteLayer(tempDbPath("cancel-unknown-resolution")))(
  "retains an admitted cancellation while an operation is unknown",
  (suite) => {
    suite.effect("requires unknown resolution before cancellation can settle", () =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: "session:cancel-unknown",
          idempotencyKey: "cancel-unknown",
          prompt: textPrompt("hello"),
        })
        const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "worker:one" })
        const operation = yield* store.recordOperation({
          ...claim,
          operationKey: "tool:non-replayable",
          kind: "tool",
          inputDigest: "digest",
          input: { call: "once" },
          replayPolicy: "never",
          attempt: claim.attempt,
        })
        yield* store.startOperation({ ...claim, operationId: operation.operationId })
        yield* store.expireRunningOperation({ ...claim, operationId: operation.operationId })
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")

        yield* runtime.cancel({ runId: receipt.runId, reason: "stop" })
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
        expect((yield* store.getOperation({ runId: receipt.runId, operationId: operation.operationId })).status).toBe(
          "unknown",
        )
        expect((yield* runtime.history({ runId: receipt.runId, limit: 100 })).map((event) => event._tag)).not.toContain(
          "RunCancelled",
        )
      }),
    )
  },
)

layer(sqliteLayer(tempDbPath("cancel-tree-quiescence")))(
  "settles every owned child before a cancelled root reports terminal",
  (suite) => {
    suite.effect("settles children before cancelled root", () =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const parent = yield* runtime.send({
          to: assistantAddress,
          sessionId: "session:cancel-quiescence",
          idempotencyKey: "parent",
          prompt: textPrompt("parent"),
        })
        const first = yield* runtime.spawn({
          parentRunId: parent.runId,
          invocationId: "child-one",
          selection: "researcher",
          prompt: textPrompt("one"),
        })
        const second = yield* runtime.spawn({
          parentRunId: parent.runId,
          invocationId: "child-two",
          selection: "researcher",
          prompt: textPrompt("two"),
        })

        yield* runtime.cancel({ runId: parent.runId, reason: "stop" })

        expect((yield* runtime.inspect(first.runId)).status).toBe("cancelled")
        expect((yield* runtime.inspect(second.runId)).status).toBe("cancelled")
        expect((yield* runtime.inspect(parent.runId)).status).toBe("cancelled")

        const tree = yield* RunTree.replay({ rootRunId: parent.runId, limit: 500 })
        const cancelled = tree.events.filter((item) => item.event._tag === "RunCancelled").map((item) => item.runId)
        expect(new Set(cancelled)).toEqual(new Set([parent.runId, first.runId, second.runId]))
        expect(cancelled[cancelled.length - 1]).toBe(parent.runId)
      }),
    )
  },
)

it.live("child link reconciliation and cursor replay after reopen", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("child")
    const admit = Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore.RunStore
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:child",
        idempotencyKey: "parent",
        prompt: textPrompt("parent"),
      })
      const child = yield* runtime.spawn({
        parentRunId: parent.runId,
        invocationId: "inv-1",
        selection: "researcher",
        prompt: textPrompt("child"),
      })
      yield* driver.complete({
        ...(yield* driver.claimExecution({ runId: child.runId, ownerId: "test" })),
        runId: child.runId,
        result: completedResult("child-done"),
      })
      const parentTags = yield* runtime.events({ runId: parent.runId }).pipe(
        Stream.take(5),
        Stream.runCollect,
        Effect.map((chunk) => [...chunk].map((event) => event._tag)),
      )
      expect(parentTags).toContain("ChildLinked")
      expect(parentTags).toContain("ChildSettled")
      return parent.runId
    })
    const parentRunId = yield* scopedWith(sqliteLayer(filename))(admit)
    const replay = Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const tags = yield* runtime.events({ runId: parentRunId, cursor: 0 }).pipe(
        Stream.take(3),
        Stream.runCollect,
        Effect.map((chunk) => [...chunk].map((event) => event._tag)),
      )
      expect(tags.length).toBeGreaterThan(0)
      expect(schemaChecksum().length).toBe(64)
    })
    yield* scopedWith(sqliteLayer(filename))(replay)
  }),
)

it.live("serializes concurrent sqlite writers on one file", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("concurrent")
    yield* scopedWith(sqliteLayer(filename))(Effect.void)
    const send = (key: string) =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        return yield* runtime.send({
          to: assistantAddress,
          sessionId: "session:concurrent",
          idempotencyKey: key,
          prompt: textPrompt(key),
        })
      })

    const results = yield* Effect.all(
      Array.from({ length: 8 }, (_, index) => scopedWith(sqliteLayer(filename))(send(`k${index}`))),
      { concurrency: 8 },
    )
    expect(new Set(results.map((receipt) => receipt.runId)).size).toBe(8)
    expect(results.map((receipt) => receipt.acceptedSequence).toSorted((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ])
  }),
)
