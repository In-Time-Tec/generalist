import "../state/suites/worker-wakeup-suite.js"
import { makeObjectStorage, objectRuntimeLayer, objectWorkerId } from "./object.js"
import "./suites/fifo-suite.js"
import { describe, expect, it as standalone, layer } from "@effect/vitest"
import { provideScoped } from "./scoped-provide.js"
import { Deferred, Effect, Exit, Layer, Ref, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import {
  ChildRuns,
  ExecutableResolver,
  RunExecutor,
  LocalScheduler,
  Runtime,
  RunStore,
} from "../../../src/runtime/index.js"
import {
  assistant,
  assistantAddress,
  assistantRef,
  completedResult,
  openWait,
  registrationsFor,
  researcher,
  researcherRef,
  suspension,
} from "./fixtures.js"
import { Agent } from "../../../src/index.js"
import { closedTestAgent } from "../run/identity.js"
import { layer as activeExecutionsLayer } from "../../../src/runtime/execution/active-executions.js"
import { make as makeLocalScheduler } from "../../../src/runtime/execution/local-scheduler-internal.js"
import { allowAllAuthorization } from "../../authorization.js"
const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

const childSuspension = (childRunId: string, waitId: string) =>
  suspension({ waitId, token: childRunId, toolName: ChildRuns.toolName })

standalone.effect("releases blocked provider resources after a scheduler fixture failure", () =>
  Effect.gen(function* () {
    const release = yield* Deferred.make<void>()
    const started = yield* Deferred.make<void>()
    const finalized = yield* Ref.make(false)
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () =>
          Stream.fromEffect(Deferred.succeed(started, undefined)).pipe(
            Stream.drain,
            Stream.concat(Stream.fromEffect(Deferred.await(release)).pipe(Stream.drain)),
            Stream.concat(Stream.make(Response.makePart("text-delta", { id: "answer", delta: "done" }), finish)),
            Stream.ensuring(Ref.set(finalized, true)),
          ),
      }),
    )
    const resolver = ExecutableResolver.layerStatic([
      {
        executable: assistantRef,
        agent: Agent.close(assistant, Layer.mergeAll(allowAllAuthorization, model)),
      },
    ]).pipe(Layer.orDie)
    const result = yield* provideScoped(
      objectRuntimeLayer({
        addresses: [
          { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
        ],
        scheduler: { pollInterval: "1 day" },
      }).pipe(Layer.provide(resolver)),
      Effect.gen(function* () {
        yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
        const runtime = yield* Runtime.Runtime
        const scheduler = yield* LocalScheduler.LocalScheduler
        yield* runtime.send({
          to: assistantAddress,
          sessionId: "fixture-cleanup",
          idempotencyKey: "fixture-cleanup",
          prompt: "run",
        })
        yield* scheduler.tick
        yield* Deferred.await(started)
        return yield* Effect.die("simulated scheduler fixture assertion")
      }),
    ).pipe(Effect.exit)
    expect(Exit.isFailure(result)).toBe(true)
    expect(yield* Ref.get(finalized)).toBe(true)
  }),
)

{
  {
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () =>
          Stream.fromIterable<Response.StreamPartEncoded>([
            Response.makePart("text-delta", { id: "answer", delta: "done" }),
            finish,
          ]),
      }),
    )
    const options = {
      resolverLayer: ExecutableResolver.layerStatic([
        { executable: assistantRef, agent: Agent.close(assistant, Layer.mergeAll(allowAllAuthorization, model)) },
        { executable: researcherRef, agent: Agent.close(researcher, Layer.mergeAll(allowAllAuthorization, model)) },
      ]).pipe(Layer.orDie),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const },
    }
    const runtimeLayer = objectRuntimeLayer(options).pipe(Layer.provide(options.resolverLayer))

    layer(runtimeLayer)(`object local scheduler executes admitted roots and children`, (it) => {
      it.effect("executes admitted roots and children", () =>
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const scheduler = yield* LocalScheduler.LocalScheduler
          const store = yield* RunStore.RunStore
          const root = yield* runtime.send({
            to: assistantAddress,
            sessionId: `scheduler:object`,
            idempotencyKey: "root",
            prompt: "root",
          })
          yield* scheduler.tick
          yield* scheduler.idle
          const rootSnapshot = yield* runtime.snapshot(root.runId)
          if (rootSnapshot.outcome?._tag === "Failed") return yield* Effect.die(rootSnapshot.outcome.error)
          expect(rootSnapshot.run.status).toBe("succeeded")
          const parent = yield* runtime.send({
            to: assistantAddress,
            sessionId: `scheduler-child:object`,
            idempotencyKey: "parent",
            prompt: "parent",
          })
          yield* store.claimExecution({
            commandId: "runtime-execution-local-scheduler-test-ts-claim-1",
            runId: parent.runId,
            ownerId: objectWorkerId,
          })
          const child = yield* runtime.spawn({
            parentRunId: parent.runId,
            invocationId: "research",
            selection: "researcher",
            prompt: "child",
          })
          expect((yield* runtime.inspect(child.runId)).status).toBe("queued")
          expect(
            (yield* runtime.history({ runId: child.runId, cursor: -1, limit: 100 })).map((event) => event._tag),
          ).toEqual(["RunAccepted"])
          const recovered = yield* runtime.spawn({
            parentRunId: parent.runId,
            invocationId: "recovered",
            selection: "researcher",
            prompt: "recovered child",
          })
          const recoveredClaim = yield* store.claimExecution({
            commandId: "runtime-execution-local-scheduler-test-ts-claim-2",
            runId: recovered.runId,
            ownerId: objectWorkerId,
          })
          expect((yield* runtime.inspect(recovered.runId)).status).toBe("running")
          yield* store.releaseExecution(recoveredClaim)
          yield* scheduler.tick
          yield* scheduler.idle
          expect((yield* runtime.inspect(child.runId)).status).toBe("succeeded")
          expect((yield* runtime.inspect(recovered.runId)).status).toBe("succeeded")
          expect((yield* store.loadExecution(recovered.runId)).attemptFence).toBe(recoveredClaim.attemptFence + 1)
          for (const runId of [child.runId, recovered.runId]) {
            const tags = (yield* runtime.history({ runId, cursor: -1, limit: 100 })).map((event) => event._tag)
            expect(tags.filter((tag) => tag === "RunAttemptStarted")).toHaveLength(1)
          }
        }),
      )
    })
  }

  {
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () =>
          Stream.fromIterable<Response.StreamPartEncoded>([
            Response.makePart("text-delta", { id: "answer", delta: "done" }),
            finish,
          ]),
      }),
    )
    const options = {
      resolverLayer: ExecutableResolver.layerStatic([
        { executable: assistantRef, agent: Agent.close(assistant, Layer.mergeAll(allowAllAuthorization, model)) },
      ]).pipe(Layer.orDie),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const },
    }
    const runtimeLayer = objectRuntimeLayer(options).pipe(Layer.provide(options.resolverLayer))

    layer(runtimeLayer)(`object local scheduler preserves an external execution claim`, (it) => {
      it.effect("does not fence an external execution claim", () =>
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const scheduler = yield* LocalScheduler.LocalScheduler
          const store = yield* RunStore.RunStore
          const receipt = yield* runtime.send({
            to: assistantAddress,
            sessionId: `scheduler-external-claim:object`,
            idempotencyKey: "run",
            prompt: "run",
          })
          const claim = yield* store.claimExecution({
            commandId: "runtime-execution-local-scheduler-test-ts-claim-3",
            runId: receipt.runId,
            ownerId: objectWorkerId,
          })

          yield* scheduler.tick

          expect(yield* store.loadExecution(receipt.runId)).toMatchObject({
            ownerId: claim.ownerId,
            attemptFence: claim.attemptFence,
          })
          yield* store.releaseExecution(claim)
          expect((yield* store.loadExecution(receipt.runId)).ownerId).toBeUndefined()
          const replacement = yield* store.claimExecution({
            commandId: "runtime-execution-local-scheduler-test-ts-claim-4",
            runId: receipt.runId,
            ownerId: objectWorkerId,
          })
          yield* store.releaseExecution(claim)
          expect(yield* store.loadExecution(receipt.runId)).toMatchObject({
            ownerId: replacement.ownerId,
            attemptFence: replacement.attemptFence,
          })
          yield* store.releaseExecution(replacement)
          yield* scheduler.tick
          yield* scheduler.idle
          expect(yield* runtime.inspect(receipt.runId)).toMatchObject({ status: "succeeded" })
          expect(yield* store.loadExecution(receipt.runId)).toMatchObject({
            attemptFence: replacement.attemptFence + 1,
          })
          expect((yield* store.loadExecution(receipt.runId)).ownerId).toBeUndefined()
          expect(
            (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })).filter(
              (event) => event._tag === "RunAttemptStarted",
            ),
          ).toHaveLength(1)
        }),
      )
    })
  }

  {
    const options = {
      resolverLayer: ExecutableResolver.layerStatic([
        { executable: assistantRef, agent: closedTestAgent(assistant) },
        { executable: researcherRef, agent: closedTestAgent(researcher) },
      ]).pipe(Layer.orDie),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const },
    }
    const runtimeLayer = objectRuntimeLayer(options).pipe(Layer.provide(options.resolverLayer))

    layer(runtimeLayer)(`object local scheduler reconciles an orphaned cancelling tree root last`, (it) => {
      it.effect("reconciles an orphaned cancelling tree root last", () =>
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const scheduler = yield* LocalScheduler.LocalScheduler
          const store = yield* RunStore.RunStore
          const parent = yield* runtime.send({
            to: assistantAddress,
            sessionId: `scheduler-cancel:object`,
            idempotencyKey: "parent",
            prompt: "parent",
          })
          const parentClaim = yield* store.claimExecution({
            commandId: "runtime-execution-local-scheduler-test-ts-claim-5",
            runId: parent.runId,
            ownerId: objectWorkerId,
          })
          const childOutcome = yield* ChildRuns.make(store).invoke({
            parentRunId: parent.runId,
            toolCallId: "child-tool",
            selection: "researcher",
            prompt: "child",
          })
          if (childOutcome._tag !== "Suspend") return yield* Effect.die("child did not suspend")
          yield* store.suspend({
            ...parentClaim,
            waits: [openWait({ waitId: "child-tool" })],
            suspension: childSuspension(childOutcome.token, "child-tool"),
          })
          yield* store.complete({
            commandId: "runtime-execution-local-scheduler-test-ts-complete-1",
            ...(yield* store.claimExecution({
              commandId: "runtime-execution-local-scheduler-test-ts-claim-6",
              runId: childOutcome.token,
              ownerId: objectWorkerId,
            })),
            result: completedResult("done"),
          })
          const blocker = yield* runtime.spawn({
            parentRunId: parent.runId,
            invocationId: "blocker",
            selection: "researcher",
            prompt: "block",
          })
          const blockerClaim = yield* store.claimExecution({
            commandId: "runtime-execution-local-scheduler-test-ts-claim-7",
            runId: blocker.runId,
            ownerId: objectWorkerId,
          })

          yield* runtime.cancel({
            commandId: "runtime-execution-local-scheduler-test-ts-cancel-2",
            runId: parent.runId,
            reason: "stop",
          })
          expect((yield* runtime.inspect(parent.runId)).status).toBe("cancelling")
          yield* store.releaseExecution(blockerClaim)
          yield* scheduler.tick
          yield* scheduler.tick

          expect((yield* runtime.inspect(blocker.runId)).status).toBe("cancelled")
          expect((yield* runtime.inspect(parent.runId)).status).toBe("cancelled")
          const history = yield* runtime.history({ runId: parent.runId, cursor: -1, limit: 100 })
          const tags = history.map((event) => event._tag)
          expect(tags.slice(tags.indexOf("RunCancellationRequested") + 1)).not.toContain("RunResumed")
          expect(tags.filter((tag) => tag === "RunCancelled")).toHaveLength(1)
          const tree = yield* runtime.treeReplay({ rootRunId: parent.runId, limit: 100 })
          const cancelled = tree.events
            .filter((entry) => entry.event._tag === "RunCancelled")
            .map((entry) => entry.runId)
          expect(cancelled[cancelled.length - 1]).toBe(parent.runId)

          const activeParent = yield* runtime.send({
            to: assistantAddress,
            sessionId: `scheduler-active-cancel:object`,
            idempotencyKey: "parent",
            prompt: "parent",
          })
          const activeParentClaim = yield* store.claimExecution({
            commandId: "runtime-execution-local-scheduler-test-ts-claim-8",
            runId: activeParent.runId,
            ownerId: objectWorkerId,
          })
          const activeChild = yield* runtime.spawn({
            parentRunId: activeParent.runId,
            invocationId: "child",
            selection: "researcher",
            prompt: "child",
          })
          const activeChildClaim = yield* store.claimExecution({
            commandId: "runtime-execution-local-scheduler-test-ts-claim-9",
            runId: activeChild.runId,
            ownerId: objectWorkerId,
          })
          yield* runtime.cancel({
            commandId: "runtime-execution-local-scheduler-test-ts-cancel-3",
            runId: activeParent.runId,
            reason: "stop",
          })
          expect((yield* runtime.inspect(activeParent.runId)).status).toBe("cancelling")

          yield* store.releaseExecution(activeChildClaim)
          yield* store.releaseExecution(activeParentClaim)
          yield* scheduler.tick
          expect((yield* runtime.inspect(activeChild.runId)).status).toBe("cancelled")
          expect((yield* runtime.inspect(activeParent.runId)).status).toBe("cancelled")
          const activeTree = yield* runtime.treeReplay({ rootRunId: activeParent.runId, limit: 100 })
          const activeCancelled = activeTree.events
            .filter((entry) => entry.event._tag === "RunCancelled")
            .map((entry) => entry.runId)
          expect(activeCancelled).toEqual([activeChild.runId, activeParent.runId])
        }),
      )
    })
  }

  {
    const started = Deferred.makeUnsafe<void>()
    const release = Deferred.makeUnsafe<void>()
    let requests = 0
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () => {
          requests += 1
          return Stream.fromEffect(Deferred.succeed(started, undefined)).pipe(
            Stream.drain,
            Stream.concat(Stream.fromEffect(Deferred.await(release)).pipe(Stream.drain)),
            Stream.concat(Stream.make(Response.makePart("text-delta", { id: "answer", delta: "done" }), finish)),
          )
        },
      }),
    )
    const options = {
      resolverLayer: ExecutableResolver.layerStatic([
        { executable: assistantRef, agent: Agent.close(assistant, Layer.mergeAll(allowAllAuthorization, model)) },
      ]).pipe(Layer.orDie),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const },
    }
    const runtimeLayer = objectRuntimeLayer(options).pipe(Layer.provide(options.resolverLayer))

    layer(runtimeLayer)(`object overlapping scheduler ticks do not reclaim an active local Run`, (it) => {
      it.effect("does not reclaim an active local Run", () =>
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const scheduler = yield* LocalScheduler.LocalScheduler
          const store = yield* RunStore.RunStore
          const receipt = yield* runtime.send({
            to: assistantAddress,
            sessionId: `scheduler-active:object`,
            idempotencyKey: "run",
            prompt: "run",
          })
          yield* scheduler.tick
          yield* Deferred.await(started)
          const activeFence = (yield* store.loadExecution(receipt.runId)).attemptFence
          yield* scheduler.tick

          expect((yield* store.loadExecution(receipt.runId)).attemptFence).toBe(activeFence)
          yield* Deferred.succeed(release, undefined)
          yield* scheduler.idle
          expect(requests).toBe(1)
          expect((yield* runtime.inspect(receipt.runId)).status).toBe("succeeded")
        }),
      )
    })
  }

  {
    const options = {
      resolverLayer: ExecutableResolver.layerStatic([
        { executable: assistantRef, agent: closedTestAgent(assistant) },
        { executable: researcherRef, agent: closedTestAgent(researcher) },
      ]).pipe(Layer.orDie),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const },
    }
    describe(`object the cancelling sweep fences an owner absent from this process incarnation`, () => {
      standalone.effect("settles an owner absent from this process incarnation", () =>
        Effect.gen(function* () {
          const storage = makeObjectStorage()
          const runtimeLayer = () => objectRuntimeLayer(options, storage).pipe(Layer.provide(options.resolverLayer))
          const persisted = yield* provideScoped(
            runtimeLayer(),
            Effect.gen(function* () {
              const runtime = yield* Runtime.Runtime
              const store = yield* RunStore.RunStore
              const workerId = objectWorkerId

              const owned = yield* runtime.send({
                to: assistantAddress,
                sessionId: `scheduler-claim-window:object`,
                idempotencyKey: "owned",
                prompt: "owned",
              })
              const ownedClaim = yield* store.claimExecution({
                commandId: "runtime-execution-local-scheduler-test-ts-claim-10",
                runId: owned.runId,
                ownerId: workerId,
              })
              yield* runtime.cancel({
                commandId: "runtime-execution-local-scheduler-test-ts-cancel-4",
                runId: owned.runId,
                reason: "stop",
              })
              expect((yield* runtime.inspect(owned.runId)).status).toBe("cancelling")

              const orphaned = yield* runtime.send({
                to: assistantAddress,
                sessionId: `scheduler-claim-window-ghost:object`,
                idempotencyKey: "ghost",
                prompt: "ghost",
              })
              const orphanedClaim = yield* store.claimExecution({
                commandId: "runtime-execution-local-scheduler-test-ts-claim-11",
                runId: orphaned.runId,
                ownerId: objectWorkerId,
              })
              yield* runtime.cancel({
                commandId: "runtime-execution-local-scheduler-test-ts-cancel-5",
                runId: orphaned.runId,
                reason: "stop",
              })
              const scheduler = yield* LocalScheduler.LocalScheduler
              yield* scheduler.tick
              for (const claim of [ownedClaim, orphanedClaim]) {
                expect((yield* runtime.inspect(claim.runId)).status).toBe("cancelling")
                expect(yield* store.loadExecution(claim.runId)).toMatchObject({
                  ownerId: claim.ownerId,
                  attemptFence: claim.attemptFence,
                })
              }
              return { owned, orphaned, ownedClaim, orphanedClaim }
            }),
          )
          yield* provideScoped(
            runtimeLayer(),
            Effect.gen(function* () {
              const { owned, orphaned, ownedClaim, orphanedClaim } = persisted
              const runtime = yield* Runtime.Runtime
              const scheduler = yield* LocalScheduler.LocalScheduler
              const store = yield* RunStore.RunStore
              for (const claim of [ownedClaim, orphanedClaim]) {
                const execution = yield* store.loadExecution(claim.runId)
                expect(execution.ownerId).toBeUndefined()
                expect(execution.attemptFence).toBe(claim.attemptFence + 1)
              }
              yield* scheduler.tick

              expect((yield* runtime.inspect(owned.runId)).status).toBe("cancelled")
              const ownedTags = (yield* runtime.history({ runId: owned.runId, cursor: -1, limit: 100 })).map(
                (event) => event._tag,
              )
              expect(ownedTags.filter((tag) => tag === "RunCancelled")).toHaveLength(1)
              expect((yield* runtime.inspect(orphaned.runId)).status).toBe("cancelled")
              for (const claim of [ownedClaim, orphanedClaim]) {
                expect((yield* store.loadExecution(claim.runId)).attemptFence).toBe(claim.attemptFence + 2)
                expect(
                  (yield* runtime.history({ runId: claim.runId, cursor: -1, limit: 100 })).filter(
                    (event) => event._tag === "RunAttemptStarted",
                  ),
                ).toHaveLength(1)
              }
            }),
          )
        }),
      )
    })
  }

  {
    const options = {
      resolverLayer: ExecutableResolver.layerStatic([
        { executable: assistantRef, agent: closedTestAgent(assistant) },
      ]).pipe(Layer.orDie),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const, concurrency: 4 },
    }
    const runtimeLayer = objectRuntimeLayer(options).pipe(Layer.provide(options.resolverLayer))

    layer(runtimeLayer)(`object scheduler selection claims the oldest ready Runs beyond the window`, (it) => {
      it.effect("claims the oldest ready Runs beyond the window", () =>
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          const host = RunExecutor.RunExecutor.of({
            execute: (claim) =>
              store
                .complete({
                  commandId: `runtime-execution-local-scheduler-test-ts-complete-6:${claim.runId}`,
                  ...claim,
                  result: completedResult("done"),
                })
                .pipe(Effect.asVoid, Effect.orDie),
            interrupt: () => Effect.void,
          })
          const scheduler = yield* makeLocalScheduler({ workerId: objectWorkerId, concurrency: 4 }).pipe(
            Effect.provideService(RunStore.RunStore, store),
            Effect.provideService(RunExecutor.RunExecutor, host),
            Effect.provideContext(yield* Layer.build(activeExecutionsLayer)),
          )
          const receipts: Array<{ readonly runId: string }> = []
          for (let index = 0; index < 17; index += 1) {
            receipts.push(
              yield* runtime.send({
                to: assistantAddress,
                sessionId: `scheduler-fifo:object:${index}`,
                idempotencyKey: `fifo-${index}`,
                prompt: `run-${index}`,
              }),
            )
          }
          for (let tickIndex = 0; tickIndex < 5; tickIndex += 1) {
            yield* scheduler.tick
            const completed = yield* Effect.forEach(
              receipts,
              (receipt) =>
                runtime.inspect(receipt.runId).pipe(Effect.map((inspection) => inspection.status === "succeeded")),
              { concurrency: "unbounded" },
            )
            const expected = Math.min(4 * (tickIndex + 1), 17)
            expect(completed).toEqual([
              ...Array<boolean>(expected).fill(true),
              ...Array<boolean>(17 - expected).fill(false),
            ])
          }
          expect((yield* runtime.inspect(receipts[0]!.runId)).status).toBe("succeeded")
          expect((yield* runtime.inspect(receipts[16]!.runId)).status).toBe("succeeded")
        }),
      )
    })
  }

  {
    const options = {
      resolverLayer: ExecutableResolver.layerStatic([
        { executable: assistantRef, agent: closedTestAgent(assistant) },
        { executable: researcherRef, agent: closedTestAgent(researcher) },
      ]).pipe(Layer.orDie),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const },
    }
    const runtimeLayer = objectRuntimeLayer(options).pipe(Layer.provide(options.resolverLayer))

    layer(runtimeLayer)(`object scheduler never scans terminal or waiting Runs for child settlement`, (it) => {
      it.effect(
        "stays bounded past the query window",
        () =>
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const scheduler = yield* makeLocalScheduler({ workerId: objectWorkerId }).pipe(
              Effect.provideContext(yield* Layer.build(activeExecutionsLayer)),
            )
            const store = yield* RunStore.RunStore
            const runCount = 96
            const receipts: Array<{ readonly runId: string }> = []
            for (let index = 0; index < runCount; index += 1) {
              const receipt = yield* runtime.send({
                to: assistantAddress,
                sessionId: `scheduler-bounded:object:${index}`,
                idempotencyKey: `bounded-${index}`,
                prompt: `run-${index}`,
              })
              receipts.push(receipt)
            }
            for (const receipt of receipts) {
              const claim = yield* store.claimExecution({
                commandId: `runtime-execution-local-scheduler-test-ts-claim-12:${receipt.runId}`,
                runId: receipt.runId,
                ownerId: objectWorkerId,
              })
              yield* store.complete({
                commandId: `runtime-execution-local-scheduler-test-ts-complete-7:${claim.runId}`,
                ...claim,
                result: completedResult("done"),
              })
            }
            const calls: Array<{
              readonly method: string
              readonly input: { readonly limit?: number; readonly runId?: string; readonly status?: string }
            }> = []
            const spy = RunStore.RunStore.of({
              ...store,
              list: (input) => {
                calls.push({ method: "list", input: { ...input } })
                return store.list(input)
              },
              loadExecution: (runId) => {
                calls.push({ method: "loadExecution", input: { runId } })
                return store.loadExecution(runId)
              },
              snapshot: (runId) => {
                calls.push({ method: "snapshot", input: { runId } })
                return store.snapshot(runId)
              },
            })
            for (let tick = 0; tick < 2; tick += 1) {
              const before = calls.length
              yield* scheduler.tick.pipe(Effect.provideService(RunStore.RunStore, spy))
              const tickCalls = calls.slice(before)
              // Child settlement is store-authoritative, so scheduler work is only cancellation and ready selection.
              expect(tickCalls.length).toBe(3)
              for (const call of tickCalls) {
                expect(call.input.limit).toBeLessThanOrEqual(64)
              }
              expect(
                tickCalls.filter(
                  (call) =>
                    call.method === "list" &&
                    ["waiting", "succeeded", "failed", "cancelled"].includes(String(call.input.status)),
                ),
              ).toHaveLength(0)
            }
            expect(calls.filter((call) => call.method === "loadExecution")).toHaveLength(0)
            expect(calls.filter((call) => call.method === "snapshot")).toHaveLength(0)
          }),
        120_000,
      )
    })

    layer(runtimeLayer)(`object out-of-order terminal settlement still resumes the parent`, (it) => {
      it.effect(
        "resumes a parent whose child settles after a later-created run",
        () =>
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const scheduler = yield* LocalScheduler.LocalScheduler
            const store = yield* RunStore.RunStore
            const parent = yield* runtime.send({
              to: assistantAddress,
              sessionId: `scheduler-order:object`,
              idempotencyKey: "order-parent",
              prompt: "parent",
            })
            const parentClaim = yield* store.claimExecution({
              commandId: "runtime-execution-local-scheduler-test-ts-claim-13",
              runId: parent.runId,
              ownerId: objectWorkerId,
            })
            const childOutcome = yield* ChildRuns.make(store).invoke({
              parentRunId: parent.runId,
              toolCallId: "order-child",
              selection: "researcher",
              prompt: "child",
            })
            if (childOutcome._tag !== "Suspend") return yield* Effect.die("child did not suspend")
            yield* store.suspend({
              ...parentClaim,
              waits: [openWait({ waitId: "order-child" })],
              suspension: childSuspension(childOutcome.token, "order-child"),
            })
            const childClaim = yield* store.claimExecution({
              commandId: "runtime-execution-local-scheduler-test-ts-claim-15",
              runId: childOutcome.token,
              ownerId: objectWorkerId,
            })
            const later = yield* runtime.send({
              to: assistantAddress,
              sessionId: `scheduler-order-later:object`,
              idempotencyKey: "order-later",
              prompt: "later",
            })
            yield* store.complete({
              commandId: "runtime-execution-local-scheduler-test-ts-complete-2",
              ...(yield* store.claimExecution({
                commandId: "runtime-execution-local-scheduler-test-ts-claim-14",
                runId: later.runId,
                ownerId: objectWorkerId,
              })),
              result: completedResult("later"),
            })
            yield* scheduler.tick
            yield* store.complete({
              commandId: "runtime-execution-local-scheduler-test-ts-complete-3",
              ...childClaim,
              result: completedResult("child"),
            })
            yield* scheduler.tick
            const snapshot = yield* store.snapshot(parent.runId)
            expect(snapshot.run.status).not.toBe("waiting")
          }),
        60_000,
      )
    })

    layer(runtimeLayer)(`object a backlog larger than the reconcile window still drains`, (it) => {
      it.effect(
        "resumes a parent whose child sits beyond the reconcile window",
        () =>
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const scheduler = yield* LocalScheduler.LocalScheduler
            const store = yield* RunStore.RunStore
            const filler = Effect.fn("backlog.filler")(function* (label: string) {
              const receipt = yield* runtime.send({
                to: assistantAddress,
                sessionId: `scheduler-backlog-filler:object:${label}`,
                idempotencyKey: `backlog-filler-${label}`,
                prompt: `filler-${label}`,
              })
              yield* store.complete({
                commandId: `runtime-execution-local-scheduler-test-ts-complete-4:${receipt.runId}`,
                ...(yield* store.claimExecution({
                  commandId: `runtime-execution-local-scheduler-test-ts-claim-16:${receipt.runId}`,
                  runId: receipt.runId,
                  ownerId: objectWorkerId,
                })),
                result: completedResult("done"),
              })
            })
            for (let index = 0; index < 100; index += 1) yield* filler(`before-${index}`)
            const parent = yield* runtime.send({
              to: assistantAddress,
              sessionId: `scheduler-backlog:object`,
              idempotencyKey: "backlog-parent",
              prompt: "parent",
            })
            const parentClaim = yield* store.claimExecution({
              commandId: "runtime-execution-local-scheduler-test-ts-claim-17",
              runId: parent.runId,
              ownerId: objectWorkerId,
            })
            const childOutcome = yield* ChildRuns.make(store).invoke({
              parentRunId: parent.runId,
              toolCallId: "backlog-child",
              selection: "researcher",
              prompt: "child",
            })
            if (childOutcome._tag !== "Suspend") return yield* Effect.die("child did not suspend")
            yield* store.suspend({
              ...parentClaim,
              waits: [openWait({ waitId: "backlog-child" })],
              suspension: childSuspension(childOutcome.token, "backlog-child"),
            })
            yield* store.complete({
              commandId: "runtime-execution-local-scheduler-test-ts-complete-5",
              ...(yield* store.claimExecution({
                commandId: "runtime-execution-local-scheduler-test-ts-claim-18",
                runId: childOutcome.token,
                ownerId: objectWorkerId,
              })),
              result: completedResult("done"),
            })
            for (let index = 0; index < 100; index += 1) yield* filler(`after-${index}`)
            const tickBudget = 100
            let ticks = 0
            while (ticks < tickBudget && (yield* runtime.inspect(parent.runId)).status === "waiting") {
              yield* scheduler.tick
              ticks += 1
            }
            expect((yield* runtime.inspect(parent.runId)).status).not.toBe("waiting")
            expect(ticks).toBeLessThan(tickBudget)
          }),
        120_000,
      )
    })

    layer(runtimeLayer)(`object a waiting page wider than the reconcile window starves nobody`, (it) => {
      it.effect(
        "resumes a resolvable parent queued behind a full page of unresolvable ones",
        () =>
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const scheduler = yield* LocalScheduler.LocalScheduler
            const store = yield* RunStore.RunStore
            // Approval waits no terminal child can ever answer, so reconciliation never
            // shortens this page and the cursor is the only thing that can reach past it.
            for (let index = 0; index < 34; index += 1) {
              const blocked = yield* runtime.send({
                to: assistantAddress,
                sessionId: `scheduler-starve-blocked:object:${index}`,
                idempotencyKey: `starve-blocked-${index}`,
                prompt: "blocked",
              })
              const blockedClaim = yield* store.claimExecution({
                commandId: `runtime-execution-local-scheduler-test-ts-claim-19:${blocked.runId}`,
                runId: blocked.runId,
                ownerId: objectWorkerId,
              })
              yield* store.suspend({
                ...blockedClaim,
                waits: [openWait({ waitId: `starve-approval-${index}`, reason: "approval" })],
                suspension: suspension({ waitId: `starve-approval-${index}`, reason: "approval" }),
              })
            }
            const parent = yield* runtime.send({
              to: assistantAddress,
              sessionId: `scheduler-starve:object`,
              idempotencyKey: "starve-parent",
              prompt: "parent",
            })
            const parentClaim = yield* store.claimExecution({
              commandId: "runtime-execution-local-scheduler-test-ts-claim-20",
              runId: parent.runId,
              ownerId: objectWorkerId,
            })
            const childOutcome = yield* ChildRuns.make(store).invoke({
              parentRunId: parent.runId,
              toolCallId: "starve-child",
              selection: "researcher",
              prompt: "child",
            })
            if (childOutcome._tag !== "Suspend") return yield* Effect.die("child did not suspend")
            yield* store.suspend({
              ...parentClaim,
              waits: [openWait({ waitId: "starve-child" })],
              suspension: childSuspension(childOutcome.token, "starve-child"),
            })
            yield* store.complete({
              commandId: "runtime-execution-local-scheduler-test-ts-complete-8",
              ...(yield* store.claimExecution({
                commandId: "runtime-execution-local-scheduler-test-ts-claim-21",
                runId: childOutcome.token,
                ownerId: objectWorkerId,
              })),
              result: completedResult("done"),
            })
            const tickBudget = 40
            let ticks = 0
            while (ticks < tickBudget && (yield* runtime.inspect(parent.runId)).status === "waiting") {
              yield* scheduler.tick
              ticks += 1
            }
            expect((yield* runtime.inspect(parent.runId)).status).not.toBe("waiting")
            expect(ticks).toBeLessThan(tickBudget)
          }),
        120_000,
      )
    })

    layer(runtimeLayer)(`object idle scheduler performs no child-settlement polling`, (it) => {
      it.effect("does no child-settlement work while nothing changes", () =>
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const scheduler = yield* LocalScheduler.LocalScheduler
          const store = yield* RunStore.RunStore
          const receipt = yield* runtime.send({
            to: assistantAddress,
            sessionId: `scheduler-idle:object`,
            idempotencyKey: "idle-0",
            prompt: "run-idle",
          })
          const claim = yield* store.claimExecution({
            commandId: "runtime-execution-local-scheduler-test-ts-claim-22",
            runId: receipt.runId,
            ownerId: objectWorkerId,
          })
          yield* store.complete({
            commandId: "runtime-execution-local-scheduler-test-ts-complete-13",
            ...claim,
            result: completedResult("done"),
          })
          const calls: Array<{ readonly method: string; readonly status?: string }> = []
          const spy = RunStore.RunStore.of({
            ...store,
            list: (input) => {
              calls.push({ method: "list", status: String(input.status) })
              return store.list(input)
            },
            listRelated: (runId) => {
              calls.push({ method: "listRelated" })
              return store.listRelated(runId)
            },
            loadExecution: (runId) => {
              calls.push({ method: "loadExecution" })
              return store.loadExecution(runId)
            },
            snapshot: (runId) => {
              calls.push({ method: "snapshot" })
              return store.snapshot(runId)
            },
          })
          yield* scheduler.tick.pipe(Effect.provideService(RunStore.RunStore, spy))
          calls.length = 0
          yield* scheduler.tick.pipe(Effect.provideService(RunStore.RunStore, spy))
          expect(calls.filter((call) => call.method === "list" && call.status === "waiting")).toHaveLength(0)
          expect(
            calls.filter(
              (call) => call.method === "list" && ["succeeded", "failed", "cancelled"].includes(call.status ?? ""),
            ),
          ).toHaveLength(0)
          expect(calls.filter((call) => call.method === "listRelated")).toHaveLength(0)
          expect(calls.filter((call) => call.method === "snapshot")).toHaveLength(0)
        }),
      )
    })
  }

  {
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () =>
          Stream.fromIterable<Response.StreamPartEncoded>([
            Response.makePart("text-delta", { id: "answer", delta: "done" }),
            finish,
          ]),
      }),
    )
    const options = {
      resolverLayer: ExecutableResolver.layerStatic([
        { executable: assistantRef, agent: Agent.close(assistant, Layer.mergeAll(allowAllAuthorization, model)) },
        { executable: researcherRef, agent: Agent.close(researcher, Layer.mergeAll(allowAllAuthorization, model)) },
      ]).pipe(Layer.orDie),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const },
    }
    const runtimeLayer = objectRuntimeLayer(options).pipe(Layer.provide(options.resolverLayer))

    layer(runtimeLayer)(`object scheduler resumes a waiting parent once its child settles`, (it) => {
      it.effect("resumes a waiting parent once its child settles", () =>
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const scheduler = yield* LocalScheduler.LocalScheduler
          const store = yield* RunStore.RunStore
          const parent = yield* runtime.send({
            to: assistantAddress,
            sessionId: `scheduler-resume:object`,
            idempotencyKey: "parent",
            prompt: "parent",
          })
          const parentClaim = yield* store.claimExecution({
            commandId: "runtime-execution-local-scheduler-test-ts-claim-23",
            runId: parent.runId,
            ownerId: objectWorkerId,
          })
          const outcome = yield* ChildRuns.make(store).invoke({
            parentRunId: parent.runId,
            toolCallId: "child-tool",
            selection: "researcher",
            prompt: "child",
          })
          if (outcome._tag !== "Suspend") return yield* Effect.die("child did not suspend")
          yield* store.suspend({
            ...parentClaim,
            waits: [openWait({ waitId: "child-tool" })],
            suspension: childSuspension(outcome.token, "child-tool"),
          })
          yield* scheduler.tick
          yield* scheduler.idle
          expect((yield* runtime.inspect(outcome.token)).status).toBe("succeeded")
          yield* scheduler.tick
          const parentInspection = yield* runtime.inspect(parent.runId)
          expect(parentInspection.waits).toEqual([])
          expect(yield* runtime.history({ runId: parent.runId, limit: 100 })).toContainEqual(
            expect.objectContaining({ _tag: "RunResumed", waitId: "child-tool" }),
          )
        }),
      )
    })
  }

  {
    const started = Deferred.makeUnsafe<void>()
    const release = Deferred.makeUnsafe<void>()
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () =>
          Stream.fromEffect(Deferred.succeed(started, undefined)).pipe(
            Stream.drain,
            Stream.concat(Stream.fromEffect(Deferred.await(release)).pipe(Stream.drain)),
            Stream.concat(Stream.make(Response.makePart("text-delta", { id: "answer", delta: "done" }), finish)),
          ),
      }),
    )
    const options = {
      resolverLayer: ExecutableResolver.layerStatic([
        { executable: assistantRef, agent: Agent.close(assistant, Layer.mergeAll(allowAllAuthorization, model)) },
        { executable: researcherRef, agent: closedTestAgent(researcher) },
      ]).pipe(Layer.orDie),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const },
    }
    const runtimeLayer = objectRuntimeLayer(options).pipe(Layer.provide(options.resolverLayer))

    layer(runtimeLayer)(`object a tick admits a long-running Run without blocking on it`, (it) => {
      it.effect("admits a long-running Run without blocking on it", () =>
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const scheduler = yield* LocalScheduler.LocalScheduler
          const store = yield* RunStore.RunStore
          const blocking = yield* runtime.send({
            to: assistantAddress,
            sessionId: `scheduler-nonblocking:object`,
            idempotencyKey: "blocking",
            prompt: "blocking",
          })
          // A tick that admitted a Run which has not finished must still return.
          yield* scheduler.tick
          yield* Deferred.await(started)
          expect((yield* runtime.inspect(blocking.runId)).status).toBe("running")

          // A later tick still makes progress while the earlier execution is in flight.
          const parent = yield* runtime.send({
            to: assistantAddress,
            sessionId: `scheduler-nonblocking-second:object`,
            idempotencyKey: "parent",
            prompt: "parent",
          })
          const parentClaim = yield* store.claimExecution({
            commandId: "runtime-execution-local-scheduler-test-ts-claim-24",
            runId: parent.runId,
            ownerId: objectWorkerId,
          })
          const outcome = yield* ChildRuns.make(store).invoke({
            parentRunId: parent.runId,
            toolCallId: "child-tool",
            selection: "researcher",
            prompt: "child",
          })
          if (outcome._tag !== "Suspend") return yield* Effect.die("child did not suspend")
          yield* store.suspend({
            ...parentClaim,
            waits: [openWait({ waitId: "child-tool" })],
            suspension: childSuspension(outcome.token, "child-tool"),
          })
          yield* store.complete({
            commandId: "runtime-execution-local-scheduler-test-ts-complete-9",
            ...(yield* store.claimExecution({
              commandId: "runtime-execution-local-scheduler-test-ts-claim-25",
              runId: outcome.token,
              ownerId: objectWorkerId,
            })),
            result: completedResult("done"),
          })
          yield* scheduler.tick
          const parentInspection = yield* runtime.inspect(parent.runId)
          expect(parentInspection.waits).toEqual([])
          expect(yield* runtime.history({ runId: parent.runId, limit: 100 })).toContainEqual(
            expect.objectContaining({ _tag: "RunResumed", waitId: "child-tool" }),
          )
          expect((yield* runtime.inspect(blocking.runId)).status).toBe("running")

          yield* Deferred.succeed(release, undefined)
          yield* scheduler.idle
          expect((yield* runtime.inspect(blocking.runId)).status).toBe("succeeded")
        }),
      )
    })
  }

  {
    const started = Deferred.makeUnsafe<void>()
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.never,
        streamText: () =>
          Stream.fromEffect(Deferred.succeed(started, undefined)).pipe(Stream.flatMap(() => Stream.never)),
      }),
    )
    const options = {
      resolverLayer: ExecutableResolver.layerStatic([
        { executable: assistantRef, agent: Agent.close(assistant, Layer.mergeAll(allowAllAuthorization, model)) },
      ]).pipe(Layer.orDie),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const },
    }
    const runtimeLayer = objectRuntimeLayer(options).pipe(Layer.provide(options.resolverLayer))

    layer(runtimeLayer)(
      `object the sweep interrupts an executing Run that a durable cancellation marked cancelling`,
      (it) => {
        it.effect("interrupts an executing Run on cancellation", () =>
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const scheduler = yield* LocalScheduler.LocalScheduler
            const store = yield* RunStore.RunStore
            const receipt = yield* runtime.send({
              to: assistantAddress,
              sessionId: `scheduler-sweep-interrupt:object`,
              idempotencyKey: "run",
              prompt: "run",
            })
            yield* scheduler.tick
            yield* Deferred.await(started)

            // store.cancel only records the request; delivering the interrupt to the owning
            // worker is the scheduler sweep's job, so the run must not settle without a tick.
            yield* store.cancel({
              commandId: "runtime-execution-local-scheduler-test-ts-cancel-15",
              runId: receipt.runId,
              reason: "stop",
            })
            expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelling")

            yield* scheduler.tick
            yield* scheduler.idle
            expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelled")
            expect(
              (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })).map((event) => event._tag),
            ).not.toContain("RunFailed")
          }),
        )
      },
    )
  }

  {
    const inFlight = { current: 0, peak: 0 }
    const release = Deferred.makeUnsafe<void>()
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () =>
          Stream.fromEffect(
            Effect.sync(() => {
              inFlight.current += 1
              inFlight.peak = Math.max(inFlight.peak, inFlight.current)
            }),
          ).pipe(
            Stream.drain,
            Stream.concat(Stream.fromEffect(Deferred.await(release)).pipe(Stream.drain)),
            Stream.concat(Stream.make(Response.makePart("text-delta", { id: "answer", delta: "done" }), finish)),
          ),
      }),
    )
    const options = {
      resolverLayer: ExecutableResolver.layerStatic([
        { executable: assistantRef, agent: Agent.close(assistant, Layer.mergeAll(allowAllAuthorization, model)) },
      ]).pipe(Layer.orDie),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const, concurrency: 2 },
    }
    const runtimeLayer = objectRuntimeLayer(options).pipe(Layer.provide(options.resolverLayer))

    layer(runtimeLayer, { excludeTestServices: true })(
      `object concurrency still bounds simultaneously executing Runs across ticks`,
      (it) => {
        it.effect("bounds simultaneously executing Runs across ticks", () =>
          Effect.gen(function* () {
            yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
            const runtime = yield* Runtime.Runtime
            const scheduler = yield* LocalScheduler.LocalScheduler
            for (let index = 0; index < 6; index += 1) {
              yield* runtime.send({
                to: assistantAddress,
                sessionId: `scheduler-bounded-concurrency:object:${index}`,
                idempotencyKey: `bounded-concurrency-${index}`,
                prompt: `run-${index}`,
              })
            }
            // Ticks no longer block on admitted executions, so the in-flight count is the only bound.
            for (let tick = 0; tick < 5; tick += 1) {
              yield* scheduler.tick
              yield* Effect.sleep("20 millis")
            }
            expect(inFlight.peak).toBeLessThanOrEqual(2)
            yield* Deferred.succeed(release, undefined)
            yield* scheduler.idle
          }),
        )
      },
    )
  }

  {
    const inFlight = { current: 0, peak: 0 }
    const release = Deferred.makeUnsafe<void>()
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () =>
          Stream.fromEffect(
            Effect.sync(() => {
              inFlight.current += 1
              inFlight.peak = Math.max(inFlight.peak, inFlight.current)
            }),
          ).pipe(
            Stream.drain,
            Stream.concat(Stream.fromEffect(Deferred.await(release)).pipe(Stream.drain)),
            Stream.concat(Stream.make(Response.makePart("text-delta", { id: "answer", delta: "done" }), finish)),
          ),
      }),
    )
    const options = {
      resolverLayer: ExecutableResolver.layerStatic([
        { executable: assistantRef, agent: Agent.close(assistant, Layer.mergeAll(allowAllAuthorization, model)) },
      ]).pipe(Layer.orDie),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const },
    }
    const runtimeLayer = objectRuntimeLayer(options).pipe(Layer.provide(options.resolverLayer))

    layer(runtimeLayer, { excludeTestServices: true })(
      `object default concurrency starts every selected Run without a bound`,
      (it) => {
        it.effect("starts more than the former default bound", () =>
          Effect.gen(function* () {
            yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
            const runtime = yield* Runtime.Runtime
            const scheduler = yield* LocalScheduler.LocalScheduler
            for (let index = 0; index < 6; index += 1) {
              yield* runtime.send({
                to: assistantAddress,
                sessionId: `scheduler-unbounded-concurrency:object:${index}`,
                idempotencyKey: `unbounded-concurrency-${index}`,
                prompt: `run-${index}`,
              })
            }
            yield* scheduler.tick
            let attempts = 0
            while (inFlight.current < 6 && attempts < 20) {
              yield* Effect.sleep("10 millis")
              attempts += 1
            }
            expect(inFlight.peak).toBe(6)
            yield* Deferred.succeed(release, undefined)
            yield* scheduler.idle
          }),
        )
      },
    )
  }
}
