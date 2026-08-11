import { expect, layer } from "@effect/vitest"
import { Deferred, Effect, Layer, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import { ChildRuns, ExecutionHost, LocalScheduler, Runtime, RunStore } from "../src/index.js"
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
} from "./helpers.js"
import { Agent } from "@batonfx/core"
import { closedTestAgent } from "./identity.js"
import { makeStatic } from "../src/executable-resolver.js"
import { layer as activeExecutionsLayer } from "../src/active-executions.js"
import { make as makeLocalScheduler } from "../src/local-scheduler.js"
import { tempDbPath } from "./sqlite-helpers.js"

const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

for (const backend of ["memory", "sqlite"] as const) {
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
      resolver: makeStatic([
        { executable: assistantRef, agent: Agent.close(assistant, model) },
        { executable: researcherRef, agent: Agent.close(researcher, model) },
      ]),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const },
    }
    const runtimeLayer =
      backend === "memory"
        ? Runtime.layerMemory(options)
        : Runtime.layerSqlite({ ...options, filename: tempDbPath("local-scheduler") })

    layer(runtimeLayer)(`${backend} local scheduler executes admitted roots and children`, (it) => {
      it.effect("executes admitted roots and children", () =>
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const scheduler = yield* LocalScheduler.LocalScheduler
          const store = yield* RunStore.RunStore
          const root = yield* runtime.send({
            to: assistantAddress,
            sessionId: `scheduler:${backend}`,
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
            sessionId: `scheduler-child:${backend}`,
            idempotencyKey: "parent",
            prompt: "parent",
          })
          yield* store.claimExecution({ runId: parent.runId, ownerId: "manual-parent" })
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
          yield* store.claimExecution({ runId: recovered.runId, ownerId: backend })
          expect((yield* runtime.inspect(recovered.runId)).status).toBe("running")
          yield* scheduler.tick
          yield* scheduler.idle
          expect((yield* runtime.inspect(child.runId)).status).toBe("succeeded")
          expect((yield* runtime.inspect(recovered.runId)).status).toBe("succeeded")
          for (const runId of [child.runId, recovered.runId]) {
            const tags = (yield* runtime.history({ runId, cursor: -1, limit: 100 })).map((event) => event._tag)
            expect(tags.filter((tag) => tag === "RunAttemptStarted")).toHaveLength(1)
          }
        }),
      )
    })
  }

  {
    const options = {
      resolver: makeStatic([
        { executable: assistantRef, agent: closedTestAgent(assistant) },
        { executable: researcherRef, agent: closedTestAgent(researcher) },
      ]),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const },
    }
    const runtimeLayer =
      backend === "memory"
        ? Runtime.layerMemory(options)
        : Runtime.layerSqlite({ ...options, filename: tempDbPath("local-scheduler-cancel") })

    layer(runtimeLayer)(`${backend} local scheduler reconciles an orphaned cancelling tree root last`, (it) => {
      it.effect("reconciles an orphaned cancelling tree root last", () =>
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const scheduler = yield* LocalScheduler.LocalScheduler
          const store = yield* RunStore.RunStore
          const parent = yield* runtime.send({
            to: assistantAddress,
            sessionId: `scheduler-cancel:${backend}`,
            idempotencyKey: "parent",
            prompt: "parent",
          })
          const parentClaim = yield* store.claimExecution({ runId: parent.runId, ownerId: "orphan-parent" })
          const childOutcome = yield* ChildRuns.make(store).invoke({
            parentRunId: parent.runId,
            toolCallId: "child-tool",
            selection: "researcher",
            prompt: "child",
          })
          if (childOutcome._tag !== "Suspend") return yield* Effect.die("child did not suspend")
          yield* store.suspend({
            ...parentClaim,
            wait: openWait({ waitId: "child-tool" }),
            suspension: suspension({ waitId: "child-tool" }),
          })
          yield* store.complete({
            ...(yield* store.claimExecution({ runId: childOutcome.token, ownerId: "finished-child" })),
            result: completedResult("done"),
          })
          const blocker = yield* runtime.spawn({
            parentRunId: parent.runId,
            invocationId: "blocker",
            selection: "researcher",
            prompt: "block",
          })
          yield* store.claimExecution({ runId: blocker.runId, ownerId: "orphan-child" })

          yield* runtime.cancel({ runId: parent.runId, reason: "stop" })
          expect((yield* runtime.inspect(parent.runId)).status).toBe("cancelling")
          yield* scheduler.tick
          yield* scheduler.tick

          expect((yield* runtime.inspect(blocker.runId)).status).toBe("cancelled")
          expect((yield* runtime.inspect(parent.runId)).status).toBe("cancelled")
          const history = yield* runtime.history({ runId: parent.runId, cursor: -1, limit: 100 })
          const tags = history.map((event) => event._tag)
          expect(tags.slice(tags.indexOf("RunCancellationRequested") + 1)).not.toContain("RunResumed")
          expect(tags.filter((tag) => tag === "RunCancelled")).toHaveLength(1)
          const tree = yield* runtime.treeHistory({ rootRunId: parent.runId, limit: 100 })
          const cancelled = tree.events
            .filter((entry) => entry.event._tag === "RunCancelled")
            .map((entry) => entry.runId)
          expect(cancelled[cancelled.length - 1]).toBe(parent.runId)

          const activeParent = yield* runtime.send({
            to: assistantAddress,
            sessionId: `scheduler-active-cancel:${backend}`,
            idempotencyKey: "parent",
            prompt: "parent",
          })
          yield* store.claimExecution({ runId: activeParent.runId, ownerId: "orphan-active-parent" })
          const activeChild = yield* runtime.spawn({
            parentRunId: activeParent.runId,
            invocationId: "child",
            selection: "researcher",
            prompt: "child",
          })
          yield* store.claimExecution({ runId: activeChild.runId, ownerId: "orphan-active-child" })
          yield* runtime.cancel({ runId: activeParent.runId, reason: "stop" })
          expect((yield* runtime.inspect(activeParent.runId)).status).toBe("cancelling")

          yield* scheduler.tick
          expect((yield* runtime.inspect(activeChild.runId)).status).toBe("cancelled")
          expect((yield* runtime.inspect(activeParent.runId)).status).toBe("cancelled")
          const activeTree = yield* runtime.treeHistory({ rootRunId: activeParent.runId, limit: 100 })
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
      resolver: makeStatic([{ executable: assistantRef, agent: Agent.close(assistant, model) }]),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const },
    }
    const runtimeLayer =
      backend === "memory"
        ? Runtime.layerMemory(options)
        : Runtime.layerSqlite({ ...options, filename: tempDbPath("local-scheduler-active") })

    layer(runtimeLayer)(`${backend} overlapping scheduler ticks do not reclaim an active local Run`, (it) => {
      it.effect("does not reclaim an active local Run", () =>
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const scheduler = yield* LocalScheduler.LocalScheduler
          const store = yield* RunStore.RunStore
          const receipt = yield* runtime.send({
            to: assistantAddress,
            sessionId: `scheduler-active:${backend}`,
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
      resolver: makeStatic([
        { executable: assistantRef, agent: closedTestAgent(assistant) },
        { executable: researcherRef, agent: closedTestAgent(researcher) },
      ]),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const },
    }
    const runtimeLayer =
      backend === "memory"
        ? Runtime.layerMemory(options)
        : Runtime.layerSqlite({ ...options, filename: tempDbPath("local-scheduler-claim-window") })

    layer(runtimeLayer)(
      `${backend} the cancelling sweep fences an owner absent from this process incarnation`,
      (it) => {
        it.effect("settles an owner absent from this process incarnation", () =>
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const scheduler = yield* LocalScheduler.LocalScheduler
            const store = yield* RunStore.RunStore
            const workerId = backend === "memory" ? "memory" : "sqlite"

            const owned = yield* runtime.send({
              to: assistantAddress,
              sessionId: `scheduler-claim-window:${backend}`,
              idempotencyKey: "owned",
              prompt: "owned",
            })
            yield* store.claimExecution({ runId: owned.runId, ownerId: workerId })
            yield* runtime.cancel({ runId: owned.runId, reason: "stop" })
            expect((yield* runtime.inspect(owned.runId)).status).toBe("cancelling")

            const orphaned = yield* runtime.send({
              to: assistantAddress,
              sessionId: `scheduler-claim-window-ghost:${backend}`,
              idempotencyKey: "ghost",
              prompt: "ghost",
            })
            yield* store.claimExecution({ runId: orphaned.runId, ownerId: "ghost-owner" })
            yield* runtime.cancel({ runId: orphaned.runId, reason: "stop" })

            yield* scheduler.tick

            expect((yield* runtime.inspect(owned.runId)).status).toBe("cancelled")
            const ownedTags = (yield* runtime.history({ runId: owned.runId, cursor: -1, limit: 100 })).map(
              (event) => event._tag,
            )
            expect(ownedTags.filter((tag) => tag === "RunCancelled")).toHaveLength(1)
            expect((yield* runtime.inspect(orphaned.runId)).status).toBe("cancelled")
          }),
        )
      },
    )
  }

  {
    const options = {
      resolver: makeStatic([{ executable: assistantRef, agent: closedTestAgent(assistant) }]),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const, concurrency: 4 },
    }
    const runtimeLayer =
      backend === "memory"
        ? Runtime.layerMemory(options)
        : Runtime.layerSqlite({ ...options, filename: tempDbPath("local-scheduler-fifo") })

    layer(runtimeLayer)(`${backend} scheduler selection claims the oldest ready Runs beyond the window`, (it) => {
      it.effect("claims the oldest ready Runs beyond the window", () =>
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          const host = ExecutionHost.ExecutionHost.of({
            execute: (claim) =>
              store.complete({ ...claim, result: completedResult("done") }).pipe(Effect.asVoid, Effect.orDie),
            interrupt: () => Effect.void,
          })
          const scheduler = yield* makeLocalScheduler({ workerId: backend, concurrency: 4 }).pipe(
            Effect.provideService(RunStore.RunStore, store),
            Effect.provideService(ExecutionHost.ExecutionHost, host),
            Effect.provideContext(yield* Layer.build(activeExecutionsLayer)),
          )
          const receipts: Array<{ readonly runId: string }> = []
          for (let index = 0; index < 17; index += 1) {
            receipts.push(
              yield* runtime.send({
                to: assistantAddress,
                sessionId: `scheduler-fifo:${backend}:${index}`,
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
            if (backend === "memory") {
              expect(completed).toEqual([
                ...Array<boolean>(expected).fill(true),
                ...Array<boolean>(17 - expected).fill(false),
              ])
            } else {
              expect(completed.filter(Boolean)).toHaveLength(expected)
            }
          }
          expect((yield* runtime.inspect(receipts[0]!.runId)).status).toBe("succeeded")
          expect((yield* runtime.inspect(receipts[16]!.runId)).status).toBe("succeeded")
        }),
      )
    })
  }

  {
    const options = {
      resolver: makeStatic([
        { executable: assistantRef, agent: closedTestAgent(assistant) },
        { executable: researcherRef, agent: closedTestAgent(researcher) },
      ]),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const },
    }
    const runtimeLayer =
      backend === "memory"
        ? Runtime.layerMemory(options)
        : Runtime.layerSqlite({ ...options, filename: tempDbPath("local-scheduler-bounded") })

    layer(runtimeLayer)(`${backend} terminal reconciliation stays bounded past the query window`, (it) => {
      it.effect(
        "stays bounded past the query window",
        () =>
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const scheduler = yield* LocalScheduler.LocalScheduler
            const store = yield* RunStore.RunStore
            const runCount = backend === "memory" ? 1000 : 400
            const receipts: Array<{ readonly runId: string }> = []
            for (let index = 0; index < runCount; index += 1) {
              const receipt = yield* runtime.send({
                to: assistantAddress,
                sessionId: `scheduler-bounded:${backend}:${index}`,
                idempotencyKey: `bounded-${index}`,
                prompt: `run-${index}`,
              })
              receipts.push(receipt)
            }
            for (const receipt of receipts) {
              const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "bounded-worker" })
              yield* store.complete({ ...claim, result: completedResult("done") })
            }
            const calls: Array<{ readonly method: string; readonly input: Record<string, unknown> }> = []
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
              // A terminal backlog of any size is never scanned: reconciliation reads waiting parents only.
              expect(tickCalls.length).toBe(4)
              for (const call of tickCalls) {
                expect(call.input.limit).toBeLessThanOrEqual(64)
              }
              expect(
                tickCalls.filter(
                  (call) =>
                    call.method === "list" && ["succeeded", "failed", "cancelled"].includes(String(call.input.status)),
                ),
              ).toHaveLength(0)
            }
            expect(calls.filter((call) => call.method === "loadExecution")).toHaveLength(0)
            expect(calls.filter((call) => call.method === "snapshot")).toHaveLength(0)
          }),
        120_000,
      )
    })

    layer(runtimeLayer)(`${backend} out-of-order terminal settlement still resumes the parent`, (it) => {
      it.effect(
        "resumes a parent whose child settles after a later-created run",
        () =>
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const scheduler = yield* LocalScheduler.LocalScheduler
            const store = yield* RunStore.RunStore
            const parent = yield* runtime.send({
              to: assistantAddress,
              sessionId: `scheduler-order:${backend}`,
              idempotencyKey: "order-parent",
              prompt: "parent",
            })
            const parentClaim = yield* store.claimExecution({ runId: parent.runId, ownerId: "order-parent" })
            const childOutcome = yield* ChildRuns.make(store).invoke({
              parentRunId: parent.runId,
              toolCallId: "order-child",
              selection: "researcher",
              prompt: "child",
            })
            if (childOutcome._tag !== "Suspend") return yield* Effect.die("child did not suspend")
            yield* store.suspend({
              ...parentClaim,
              wait: openWait({ waitId: "order-child" }),
              suspension: suspension({ waitId: "order-child" }),
            })
            const later = yield* runtime.send({
              to: assistantAddress,
              sessionId: `scheduler-order-later:${backend}`,
              idempotencyKey: "order-later",
              prompt: "later",
            })
            yield* store.complete({
              ...(yield* store.claimExecution({ runId: later.runId, ownerId: "order-later" })),
              result: completedResult("later"),
            })
            yield* scheduler.tick
            yield* store.complete({
              ...(yield* store.claimExecution({ runId: childOutcome.token, ownerId: "order-child-worker" })),
              result: completedResult("child"),
            })
            yield* scheduler.tick
            const snapshot = yield* store.snapshot(parent.runId)
            expect(snapshot.run.status).not.toBe("waiting")
          }),
        60_000,
      )
    })

    layer(runtimeLayer)(`${backend} a backlog larger than the reconcile window still drains`, (it) => {
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
                sessionId: `scheduler-backlog-filler:${backend}:${label}`,
                idempotencyKey: `backlog-filler-${label}`,
                prompt: `filler-${label}`,
              })
              yield* store.complete({
                ...(yield* store.claimExecution({ runId: receipt.runId, ownerId: "backlog-filler-worker" })),
                result: completedResult("done"),
              })
            })
            for (let index = 0; index < 100; index += 1) yield* filler(`before-${index}`)
            const parent = yield* runtime.send({
              to: assistantAddress,
              sessionId: `scheduler-backlog:${backend}`,
              idempotencyKey: "backlog-parent",
              prompt: "parent",
            })
            const parentClaim = yield* store.claimExecution({ runId: parent.runId, ownerId: "backlog-parent-worker" })
            const childOutcome = yield* ChildRuns.make(store).invoke({
              parentRunId: parent.runId,
              toolCallId: "backlog-child",
              selection: "researcher",
              prompt: "child",
            })
            if (childOutcome._tag !== "Suspend") return yield* Effect.die("child did not suspend")
            yield* store.suspend({
              ...parentClaim,
              wait: openWait({ waitId: "backlog-child" }),
              suspension: suspension({ waitId: "backlog-child" }),
            })
            yield* store.complete({
              ...(yield* store.claimExecution({ runId: childOutcome.token, ownerId: "backlog-child-worker" })),
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

    layer(runtimeLayer)(`${backend} a waiting page wider than the reconcile window starves nobody`, (it) => {
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
                sessionId: `scheduler-starve-blocked:${backend}:${index}`,
                idempotencyKey: `starve-blocked-${index}`,
                prompt: "blocked",
              })
              const blockedClaim = yield* store.claimExecution({
                runId: blocked.runId,
                ownerId: `starve-blocked-worker-${index}`,
              })
              yield* store.suspend({
                ...blockedClaim,
                wait: openWait({ waitId: `starve-approval-${index}`, reason: "approval" }),
                suspension: suspension({ waitId: `starve-approval-${index}`, reason: "approval" }),
              })
            }
            const parent = yield* runtime.send({
              to: assistantAddress,
              sessionId: `scheduler-starve:${backend}`,
              idempotencyKey: "starve-parent",
              prompt: "parent",
            })
            const parentClaim = yield* store.claimExecution({ runId: parent.runId, ownerId: "starve-parent-worker" })
            const childOutcome = yield* ChildRuns.make(store).invoke({
              parentRunId: parent.runId,
              toolCallId: "starve-child",
              selection: "researcher",
              prompt: "child",
            })
            if (childOutcome._tag !== "Suspend") return yield* Effect.die("child did not suspend")
            yield* store.suspend({
              ...parentClaim,
              wait: openWait({ waitId: "starve-child" }),
              suspension: suspension({ waitId: "starve-child" }),
            })
            yield* store.complete({
              ...(yield* store.claimExecution({ runId: childOutcome.token, ownerId: "starve-child-worker" })),
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

    layer(runtimeLayer)(`${backend} idle reconciliation short-circuits`, (it) => {
      it.effect("does no reconciliation work while nothing changes", () =>
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const scheduler = yield* LocalScheduler.LocalScheduler
          const store = yield* RunStore.RunStore
          const receipt = yield* runtime.send({
            to: assistantAddress,
            sessionId: `scheduler-idle:${backend}`,
            idempotencyKey: "idle-0",
            prompt: "run-idle",
          })
          const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "idle-worker" })
          yield* store.complete({ ...claim, result: completedResult("done") })
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
          const waiting = yield* store.list({ status: "waiting", order: "oldest", limit: 64 })
          // An idle tick reads one bounded waiting page and never scans the terminal backlog.
          expect(calls.filter((call) => call.method === "list" && call.status === "waiting")).toHaveLength(1)
          expect(
            calls.filter(
              (call) => call.method === "list" && ["succeeded", "failed", "cancelled"].includes(call.status ?? ""),
            ),
          ).toHaveLength(0)
          // Only a parent that still holds an open wait is inspected, never a settled Run.
          expect(calls.filter((call) => call.method === "listRelated").length).toBeLessThanOrEqual(waiting.length)
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
      resolver: makeStatic([
        { executable: assistantRef, agent: Agent.close(assistant, model) },
        { executable: researcherRef, agent: Agent.close(researcher, model) },
      ]),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const },
    }
    const runtimeLayer =
      backend === "memory"
        ? Runtime.layerMemory(options)
        : Runtime.layerSqlite({ ...options, filename: tempDbPath("local-scheduler-resume") })

    layer(runtimeLayer)(`${backend} scheduler resumes a waiting parent once its child settles`, (it) => {
      it.effect("resumes a waiting parent once its child settles", () =>
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const scheduler = yield* LocalScheduler.LocalScheduler
          const store = yield* RunStore.RunStore
          const parent = yield* runtime.send({
            to: assistantAddress,
            sessionId: `scheduler-resume:${backend}`,
            idempotencyKey: "parent",
            prompt: "parent",
          })
          const parentClaim = yield* store.claimExecution({ runId: parent.runId, ownerId: "manual-parent" })
          const outcome = yield* ChildRuns.make(store).invoke({
            parentRunId: parent.runId,
            toolCallId: "child-tool",
            selection: "researcher",
            prompt: "child",
          })
          if (outcome._tag !== "Suspend") return yield* Effect.die("child did not suspend")
          yield* store.suspend({
            ...parentClaim,
            wait: openWait({ waitId: "child-tool" }),
            suspension: suspension({ waitId: "child-tool" }),
          })
          yield* scheduler.tick
          yield* scheduler.idle
          expect((yield* runtime.inspect(outcome.token)).status).toBe("succeeded")
          yield* scheduler.tick
          const parentInspection = yield* runtime.inspect(parent.runId)
          expect(parentInspection.wait?.waitId).toBe("child-tool")
          expect(parentInspection.wait?.status).toBe("responded")
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
      resolver: makeStatic([
        { executable: assistantRef, agent: Agent.close(assistant, model) },
        { executable: researcherRef, agent: closedTestAgent(researcher) },
      ]),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const },
    }
    const runtimeLayer =
      backend === "memory"
        ? Runtime.layerMemory(options)
        : Runtime.layerSqlite({ ...options, filename: tempDbPath("local-scheduler-nonblocking") })

    layer(runtimeLayer)(`${backend} a tick admits a long-running Run without blocking on it`, (it) => {
      it.effect("admits a long-running Run without blocking on it", () =>
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const scheduler = yield* LocalScheduler.LocalScheduler
          const store = yield* RunStore.RunStore
          const blocking = yield* runtime.send({
            to: assistantAddress,
            sessionId: `scheduler-nonblocking:${backend}`,
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
            sessionId: `scheduler-nonblocking-second:${backend}`,
            idempotencyKey: "parent",
            prompt: "parent",
          })
          const parentClaim = yield* store.claimExecution({ runId: parent.runId, ownerId: "manual-parent" })
          const outcome = yield* ChildRuns.make(store).invoke({
            parentRunId: parent.runId,
            toolCallId: "child-tool",
            selection: "researcher",
            prompt: "child",
          })
          if (outcome._tag !== "Suspend") return yield* Effect.die("child did not suspend")
          yield* store.suspend({
            ...parentClaim,
            wait: openWait({ waitId: "child-tool" }),
            suspension: suspension({ waitId: "child-tool" }),
          })
          yield* store.complete({
            ...(yield* store.claimExecution({ runId: outcome.token, ownerId: "manual-child" })),
            result: completedResult("done"),
          })
          yield* scheduler.tick
          const parentInspection = yield* runtime.inspect(parent.runId)
          expect(parentInspection.wait?.status).toBe("responded")
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
      resolver: makeStatic([{ executable: assistantRef, agent: Agent.close(assistant, model) }]),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const },
    }
    const runtimeLayer =
      backend === "memory"
        ? Runtime.layerMemory(options)
        : Runtime.layerSqlite({ ...options, filename: tempDbPath("local-scheduler-sweep-interrupt") })

    layer(runtimeLayer)(
      `${backend} the sweep interrupts an executing Run that a durable cancellation marked cancelling`,
      (it) => {
        it.effect("interrupts an executing Run on cancellation", () =>
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const scheduler = yield* LocalScheduler.LocalScheduler
            const store = yield* RunStore.RunStore
            const receipt = yield* runtime.send({
              to: assistantAddress,
              sessionId: `scheduler-sweep-interrupt:${backend}`,
              idempotencyKey: "run",
              prompt: "run",
            })
            yield* scheduler.tick
            yield* Deferred.await(started)

            // store.cancel only records the request; delivering the interrupt to the owning
            // worker is the scheduler sweep's job, so the run must not settle without a tick.
            yield* store.cancel({ runId: receipt.runId, reason: "stop" })
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
      resolver: makeStatic([{ executable: assistantRef, agent: Agent.close(assistant, model) }]),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const, concurrency: 2 },
    }
    const runtimeLayer =
      backend === "memory"
        ? Runtime.layerMemory(options)
        : Runtime.layerSqlite({ ...options, filename: tempDbPath("local-scheduler-bounded-concurrency") })

    layer(runtimeLayer, { excludeTestServices: true })(
      `${backend} concurrency still bounds simultaneously executing Runs across ticks`,
      (it) => {
        it.effect("bounds simultaneously executing Runs across ticks", () =>
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const scheduler = yield* LocalScheduler.LocalScheduler
            for (let index = 0; index < 6; index += 1) {
              yield* runtime.send({
                to: assistantAddress,
                sessionId: `scheduler-bounded-concurrency:${backend}:${index}`,
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
      resolver: makeStatic([{ executable: assistantRef, agent: Agent.close(assistant, model) }]),
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" as const },
    }
    const runtimeLayer =
      backend === "memory"
        ? Runtime.layerMemory(options)
        : Runtime.layerSqlite({ ...options, filename: tempDbPath("local-scheduler-unbounded-concurrency") })

    layer(runtimeLayer, { excludeTestServices: true })(
      `${backend} default concurrency starts every selected Run without a bound`,
      (it) => {
        it.effect("starts more than the former default bound", () =>
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const scheduler = yield* LocalScheduler.LocalScheduler
            for (let index = 0; index < 6; index += 1) {
              yield* runtime.send({
                to: assistantAddress,
                sessionId: `scheduler-unbounded-concurrency:${backend}:${index}`,
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
