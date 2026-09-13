import { expect, it, layer } from "@effect/vitest"
import { Deferred, Effect, Exit, Fiber, Layer, Option, Schema, Scope, Stream } from "effect"
import { LanguageModel, Prompt, Response } from "effect/unstable/ai"
import { Agent, ExecutableManifest, Handoff, Session, ToolExecutor } from "../../../src/index.js"
import { withCacheBreakpoints } from "../../../src/core/model/prompt-cache.js"
import { Address, Errors, ExecutableResolver, RunTree } from "../../../src/runtime/index.js"
import * as Runtime from "../../../src/runtime/engine.js"
import { RunStore } from "../../../src/runtime/run/store.js"
import { RunExecutor } from "../../../src/runtime/execution/run-executor.js"
import { layer as activeExecutionsLayer } from "../../../src/runtime/execution/active-executions.js"
import { make as makeRunExecutor } from "../../../src/runtime/execution/run-executor-internal.js"
import {
  alternateAssistantAddress,
  alternateResearcherRef,
  assistantAddress,
  assistantRef,
  openWait,
  suspension,
  parentRelativeOptions,
  resolverLayer,
  researcherRef,
  textPrompt,
  registrationsFor,
} from "../execution/fixtures.js"
import { makeObjectStorage, objectRuntimeLayer, objectWorkerId } from "../execution/object.js"
import { pinnedTestAgent } from "../run/identity.js"
import { ControlState } from "../../../src/core/agent/handoff/state.js"
import { allowAllAuthorization } from "../../authorization.js"

const CheckpointState = Schema.Struct({ handoff: Schema.optionalKey(ControlState) })

const scopedWith =
  <A, E>(layerValue: Layer.Layer<A, E, never>) =>
  <B, E2, R2 extends A>(effect: Effect.Effect<B, E2, R2>): Effect.Effect<B, E | E2> =>
    Effect.scoped(Effect.flatMap(Layer.build(layerValue), (context) => effect.pipe(Effect.provideContext(context))))

layer(objectRuntimeLayer(parentRelativeOptions).pipe(Layer.provide(resolverLayer)))(
  "resolves object child selections relative to each persisted parent closure",
  (suite) => {
    suite.effect("resolves selections per persisted parent closure", () =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const first = yield* runtime.send({
          to: assistantAddress,
          sessionId: "object:relative:first",
          idempotencyKey: "parent:first",
          prompt: "first",
        })
        const second = yield* runtime.send({
          to: alternateAssistantAddress,
          sessionId: "object:relative:second",
          idempotencyKey: "parent:second",
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

it.live("resumes tree replay from an opaque cursor after an object-store reopen", () => {
  const storage = makeObjectStorage()
  const options = {
    addresses: [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
  }
  const layerFor = () => objectRuntimeLayer(options, storage).pipe(Layer.provide(resolverLayer))
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
  const initial = scopedWith(layerFor())(admit)
  const resume = (result: {
    readonly receipt: { readonly runId: string }
    readonly cursor: RunTree.ReplayPage["cursor"]
  }) =>
    Effect.gen(function* () {
      const store = yield* RunStore
      const claim = yield* store.claimExecution({
        commandId: `${result.receipt.runId}:cursor:claim`,
        runId: result.receipt.runId,
        ownerId: objectWorkerId,
      })
      yield* store.emitAgentEvent({
        commandId: `${result.receipt.runId}:cursor:event`,
        ...claim,
        event: { _tag: "TurnStarted", turn: 1 },
      })
      return yield* RunTree.replay({
        rootRunId: result.receipt.runId,
        cursor: result.cursor,
        limit: 100,
      })
    })
  return Effect.gen(function* () {
    const admitted = yield* initial
    const resumed = yield* scopedWith(layerFor())(resume(admitted))
    expect(resumed.events.map((entry) => entry.event._tag)).toEqual(["TurnStarted"])
  })
})

it.live("persists a handoff checkpoint and active pin atomically across object-store reopen", () => {
  const storage = makeObjectStorage()
  const options = {
    addresses: [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
  }
  const layerFor = () => objectRuntimeLayer(options, storage).pipe(Layer.provide(resolverLayer))
  let runId = ""
  let operationId = ""
  const checkpoint = {
    driverVersion: "1",
    executable: researcherRef.ref,
    turn: 1,
    budget: { allocation: {}, remaining: {} },
    state: {},
  } as const
  const admit = Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore
    const receipt = yield* runtime.send({
      to: assistantAddress,
      sessionId: "session:handoff",
      idempotencyKey: "handoff",
      prompt: textPrompt("handoff"),
    })
    runId = receipt.runId
    const claim = yield* store.claimExecution({
      commandId: `${runId}:handoff:claim`,
      runId,
      ownerId: objectWorkerId,
    })
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
    yield* store.startOperation({ commandId: `${runId}:handoff:start`, ...claim, operationId })
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
    const store = yield* RunStore
    const saved = yield* store.loadExecution(runId)
    expect((yield* store.getOperation({ runId, operationId })).status).toBe("succeeded")
    expect(saved.checkpoint).toEqual(checkpoint)
    expect(saved.executableRef).toEqual(researcherRef.ref)
    expect(saved.executableManifest).toEqual(assistantRef.manifest)
  })
  return Effect.gen(function* () {
    yield* scopedWith(layerFor())(admit)
    yield* scopedWith(layerFor())(reopen)
  })
})

it.live("requires explicit resolution of a handoff tool interrupted after its inner commit", () =>
  Effect.gen(function* () {
    const storage = makeObjectStorage()
    const childAgent = Agent.make({ name: "durable-specialist" })
    const child = pinnedTestAgent(childAgent, "handoff-b")
    const specialist = Handoff.target(childAgent, { pin: child.pin })
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
      allowAllAuthorization,
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
          agent: Agent.close(supervisor.agent, Layer.mergeAll(allowAllAuthorization, firstServices)),
          attestation: admittedExecutable,
        }),
    })
    const objectLayerFor = (resolver: ExecutableResolver.Service) =>
      objectRuntimeLayer(
        {
          addresses: [
            {
              address,
              executable: admittedExecutable,
              registrations: registrationsFor(admittedExecutable),
            },
          ],
        },
        storage,
      ).pipe(Layer.provide(Layer.succeed(ExecutableResolver.ExecutableResolver, resolver)))
    const crashScope = yield* Scope.make()
    const committed = Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore
      const handoffCommitted = yield* Deferred.make<void>()
      const crashStore = RunStore.of({
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
      return yield* scopedWith(activeExecutionsLayer)(
        Effect.gen(function* () {
          const crashHost = yield* makeRunExecutor.pipe(
            Effect.provideService(RunStore, crashStore),
            Effect.provideService(ExecutableResolver.ExecutableResolver, firstResolver),
          )
          const receipt = yield* runtime.send({
            to: address,
            sessionId: "session:durable-handoff",
            idempotencyKey: "durable-handoff",
            prompt: "start with the supervisor",
          })
          const claim = yield* store.claimExecution({
            commandId: `${receipt.runId}:handoff:before-reopen:claim`,
            runId: receipt.runId,
            ownerId: objectWorkerId,
          })
          const fiber = yield* crashHost.execute(claim).pipe(Effect.forkIn(crashScope))
          const failWithEvidence = (boundary: string) =>
            Effect.gen(function* () {
              yield* Fiber.interrupt(fiber).pipe(Effect.timeoutOption("1 second"), Effect.asVoid)
              const inspection = yield* runtime
                .inspect(receipt.runId)
                .pipe(Effect.exit, Effect.timeoutOption("1 second"))
              const history = yield* runtime
                .history({ runId: receipt.runId, cursor: -1, limit: 100 })
                .pipe(Effect.exit, Effect.timeoutOption("1 second"))
              const evidence = Option.match(history, {
                onNone: () => "history inspection timed out",
                onSome: (exit) =>
                  Exit.isSuccess(exit)
                    ? exit.value
                        .filter((event) => event._tag === "RunFailed" || event._tag === "OperationUnknown")
                        .slice(-2)
                    : exit,
              })
              return yield* Effect.die(
                new Error(
                  `handoff executor ended before ${boundary}: ${yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({ inspection, evidence }).pipe(Effect.orDie)}`,
                ),
              )
            })
          const boundary = yield* Effect.raceFirst(
            Deferred.await(handoffCommitted).pipe(Effect.as("handoff commit" as const)),
            Fiber.await(fiber).pipe(Effect.as("executor completion" as const)),
          ).pipe(Effect.timeoutOption("5 seconds"))
          if (Option.isNone(boundary)) return yield* failWithEvidence("the handoff commit boundary")
          if (boundary.value === "executor completion") return yield* failWithEvidence("the handoff commit boundary")
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
        }),
      )
    })
    const committedResult = yield* scopedWith(objectLayerFor(firstResolver))(committed)

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
            agent: Agent.close(childAgent, Layer.mergeAll(allowAllAuthorization, childModel)),
            attestation: activeExecutable,
          }
        }),
    })
    const reopen = Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore
      const host = yield* RunExecutor
      const session = yield* store.sessionReader("session:durable-handoff")
      if (Option.isNone(session)) return yield* Effect.die("expected durable Session")
      const conversationBeforeContinuation = Session.buildContext(yield* session.value.path())
      const claim = yield* store.claimExecution({
        commandId: `${committedResult.runId}:handoff:after-reopen:claim`,
        runId: committedResult.runId,
        ownerId: objectWorkerId,
      })
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
      yield* host.execute(
        yield* store.claimExecution({
          commandId: `${committedResult.runId}:handoff:after-resolution:claim`,
          runId: committedResult.runId,
          ownerId: objectWorkerId,
        }),
      )
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
    yield* scopedWith(objectLayerFor(reopenResolver))(reopen)
  }),
)

it.live("persists caller RunId, wait resolution, and finite inspection reads across object-store reopen", () =>
  Effect.gen(function* () {
    const storage = makeObjectStorage()
    const layerFor = () =>
      objectRuntimeLayer(
        {
          addresses: [
            { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
          ],
        },
        storage,
      ).pipe(Layer.provide(resolverLayer))
    const runId = "run:object:caller"
    const waitId = "wait:object"
    const admit = Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore
      const receipt = yield* runtime.send({
        runId,
        to: assistantAddress,
        sessionId: "session:object:caller",
        idempotencyKey: "object:caller",
        prompt: textPrompt("wait"),
      })
      expect(receipt.runId).toBe(runId)
      const claim = yield* store.claimExecution({
        commandId: `${runId}:caller:suspend:claim`,
        runId,
        ownerId: objectWorkerId,
      })
      yield* store.suspend({
        ...claim,
        runId,
        waits: [openWait({ waitId })],
        suspension: suspension({ waitId }),
      })
      yield* runtime.respond({
        runId,
        waitId,
        resolution: { _tag: "ToolResult", result: "yes", encodedResult: "yes" },
      })
    })
    const reopen = Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore
      const inspection = yield* runtime.inspect(runId)
      expect(inspection.waits).toEqual([])
      expect((yield* store.loadExecution(runId)).resolutions).toEqual([
        {
          waitId,
          resolution: { _tag: "ToolResult", result: "yes", encodedResult: "yes" },
        },
      ])
      expect((yield* runtime.snapshot(runId)).cursor).toBe(inspection.lastSequence)
      expect((yield* runtime.history({ runId, limit: 1 })).length).toBe(1)
      expect((yield* runtime.list({ limit: 10 })).map((run) => run.runId)).toContain(runId)
      const conflict = yield* runtime
        .send({
          runId,
          to: assistantAddress,
          sessionId: "session:object:caller",
          idempotencyKey: "different",
          prompt: textPrompt("different"),
        })
        .pipe(Effect.flip)
      expect(conflict).toBeInstanceOf(Errors.RunIdConflict)
    })
    yield* scopedWith(layerFor())(admit)
    yield* scopedWith(layerFor())(reopen)
  }),
)
