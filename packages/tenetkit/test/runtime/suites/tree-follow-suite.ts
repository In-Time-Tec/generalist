import { expect, it as testIt, layer } from "@effect/vitest"
import { provideScoped } from "../execution/scoped-provide.js"
import { Deferred, Effect, Fiber, Ref, Stream } from "effect"
import { TestClock } from "effect/testing"
import { RunStore, RunTree, Runtime } from "../../../src/runtime/index.js"
import { assistantAddress, completedResult, memoryLayer, textPrompt } from "../execution/fixtures.js"
import { sqliteLayer, tempDbPath } from "../sql/scenario.js"

const startRoot = (sessionId: string) =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    return yield* runtime.send({
      to: assistantAddress,
      sessionId,
      idempotencyKey: "root",
      prompt: textPrompt("root"),
    })
  })

const immediateDescendantDelivery = () =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const root = yield* startRoot("tree-follow:immediate")
    const child = yield* runtime.spawn({
      parentRunId: root.runId,
      invocationId: "child",
      selection: "researcher",
      prompt: textPrompt("child"),
    })
    const replay = yield* RunTree.replay({ rootRunId: root.runId, limit: 100 })
    const following = yield* RunTree.watch({ rootRunId: root.runId, cursor: replay.cursor }).pipe(
      Stream.filter(
        (entry) =>
          entry.parentRunId === child.runId &&
          entry.invocationId === "grandchild" &&
          entry.event._tag === "RunAccepted",
      ),
      Stream.take(1),
      Stream.runCollect,
      Effect.forkChild({ startImmediately: true }),
    )
    const grandchild = yield* runtime.spawn({
      parentRunId: child.runId,
      invocationId: "grandchild",
      selection: "analyst",
      prompt: textPrompt("grandchild"),
    })
    const delivered = Array.from(yield* Fiber.join(following))
    expect(delivered.map(({ runId }) => runId)).toEqual([grandchild.runId])
  })

const subscribeBeforeReplayRace = () =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore.RunStore
    const root = yield* startRoot("tree-follow:subscribe-before-replay")
    const replay = yield* RunTree.replay({ rootRunId: root.runId, limit: 100 })
    const claim = yield* store.claimExecution({ runId: root.runId, ownerId: "subscribe-before-replay" })
    const scripted: Runtime.Service = {
      ...runtime,
      treeChanges: (rootRunId) =>
        runtime.treeChanges(rootRunId).pipe(
          Stream.take(1),
          Stream.tap(() =>
            store.emitAgentEvent({ ...claim, event: { _tag: "TurnStarted", turn: 11 } }).pipe(Effect.orDie),
          ),
        ),
    }
    const delivered = Array.from(
      yield* RunTree.events({ rootRunId: root.runId, cursor: replay.cursor }).pipe(
        Stream.filter(({ event }) => event._tag === "TurnStarted"),
        Stream.take(1),
        Stream.runCollect,
        Effect.provideService(Runtime.Runtime, scripted),
      ),
    )
    expect(delivered.map(({ event }) => (event._tag === "TurnStarted" ? event.turn : undefined))).toEqual([11])
  })

const followCursorValidation = () =>
  Effect.gen(function* () {
    const root = yield* startRoot("tree-follow:cursor-validation")
    const malformed = RunTree.TreeCursor.make("not-a-cursor")
    expect(
      (yield* Effect.flip(
        RunTree.events({ rootRunId: root.runId, cursor: malformed }).pipe(Stream.take(1), Stream.runDrain),
      ))._tag,
    ).toBe("tenetkit/runtime/TreeCursorInvalid")
    expect(
      (yield* Effect.flip(RunTree.watch({ rootRunId: root.runId, cursor: malformed }).pipe(Stream.runDrain)))._tag,
    ).toBe("tenetkit/runtime/TreeCursorInvalid")
  })

const missedWakeRecovery = () =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore.RunStore
    const root = yield* startRoot("tree-follow:recovery")
    const replay = yield* RunTree.replay({ rootRunId: root.runId, limit: 100 })
    const initialRead = yield* Deferred.make<void>()
    const scripted: Runtime.Service = {
      ...runtime,
      treeChanges: () => Stream.succeed(undefined),
      treeCheckpoint: (rootRunId) =>
        runtime.treeCheckpoint(rootRunId).pipe(Effect.tap(() => Deferred.succeed(initialRead, undefined))),
    }
    const following = yield* RunTree.watch({ rootRunId: root.runId, cursor: replay.cursor }).pipe(
      Stream.filter(({ event }) => event._tag === "TurnStarted"),
      Stream.take(1),
      Stream.runCollect,
      Effect.provideService(Runtime.Runtime, scripted),
      Effect.forkChild({ startImmediately: true }),
    )
    yield* Deferred.await(initialRead)
    const claim = yield* store.claimExecution({ runId: root.runId, ownerId: "recovery" })
    yield* store.emitAgentEvent({ ...claim, event: { _tag: "TurnStarted", turn: 7 } })
    yield* TestClock.adjust("999 millis")
    expect(following.pollUnsafe()).toBeUndefined()
    yield* TestClock.adjust("1 milli")
    const delivered = Array.from(yield* Fiber.join(following))
    expect(delivered.map(({ event }) => (event._tag === "TurnStarted" ? event.turn : undefined))).toEqual([7])
  })

const replayEquivalence = () =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore.RunStore
    const root = yield* startRoot("tree-follow:replay")
    const child = yield* runtime.spawn({
      parentRunId: root.runId,
      invocationId: "child",
      selection: "researcher",
      prompt: textPrompt("child"),
    })
    const childClaim = yield* store.claimExecution({ runId: child.runId, ownerId: "child" })
    yield* store.emitAgentEvent({ ...childClaim, event: { _tag: "TurnStarted", turn: 1 } })
    yield* store.complete({ ...childClaim, result: completedResult("child") })
    const rootClaim = yield* store.claimExecution({ runId: root.runId, ownerId: "root" })
    yield* store.complete({ ...rootClaim, result: completedResult("root") })

    const replay = yield* RunTree.replay({ rootRunId: root.runId, limit: 100 })
    const watched = Array.from(yield* RunTree.watch({ rootRunId: root.runId }).pipe(Stream.runCollect))
    expect(watched.map(({ event }) => event.eventId)).toEqual(replay.events.map(({ event }) => event.eventId))
    expect(watched.map(({ cursor }) => cursor)).toEqual(replay.events.map(({ cursor }) => cursor))
  })

const boundedRecovery = () =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const root = yield* startRoot("tree-follow:bounded")
    const replay = yield* RunTree.replay({ rootRunId: root.runId, limit: 100 })
    const reads = yield* Ref.make(0)
    const limits = yield* Ref.make<ReadonlyArray<number>>([])
    const initialRead = yield* Deferred.make<void>()
    const scripted: Runtime.Service = {
      ...runtime,
      treeChanges: () => Stream.succeed(undefined),
      treeReplay: (input) =>
        Ref.update(limits, (current) => [...current, input.limit]).pipe(
          Effect.andThen(Ref.updateAndGet(reads, (count) => count + 1)),
          Effect.andThen(runtime.treeReplay(input)),
        ),
      treeCheckpoint: (rootRunId) =>
        runtime.treeCheckpoint(rootRunId).pipe(Effect.tap(() => Deferred.succeed(initialRead, undefined))),
    }
    const following = yield* RunTree.watch({ rootRunId: root.runId, cursor: replay.cursor }).pipe(
      Stream.runDrain,
      Effect.provideService(Runtime.Runtime, scripted),
      Effect.forkChild({ startImmediately: true }),
    )
    yield* Deferred.await(initialRead)
    expect(yield* Ref.get(reads)).toBe(1)
    expect(yield* Ref.get(limits)).toEqual([256])
    yield* TestClock.adjust("999 millis")
    expect(yield* Ref.get(reads)).toBe(1)
    yield* TestClock.adjust("1 milli")
    expect(yield* Ref.get(reads)).toBe(2)
    expect(yield* Ref.get(limits)).toEqual([256, 256])
    yield* Fiber.interrupt(following)
  })

layer(memoryLayer)("RunTree replay-then-follow memory", (it) => {
  it.effect("delivers an immediate descendant change without advancing the clock", immediateDescendantDelivery)
  it.effect("re-reads durable history after subscribing", subscribeBeforeReplayRace)
  it.effect("rejects invalid follow cursors immediately", followCursorValidation)
  it.effect("recovers a missed wake from durable history", missedWakeRecovery)
  it.effect("matches finite replay exactly", replayEquivalence)
  it.effect("bounds recovery reads", boundedRecovery)
})

layer(sqliteLayer(tempDbPath("tree-follow")))("RunTree replay-then-follow SQLite", (it) => {
  it.effect("delivers an immediate descendant change without advancing the clock", immediateDescendantDelivery)
  it.effect("re-reads durable history after subscribing", subscribeBeforeReplayRace)
  it.effect("rejects invalid follow cursors immediately", followCursorValidation)
  it.effect("recovers a missed wake from durable history", missedWakeRecovery)
  it.effect("matches finite replay exactly", replayEquivalence)
  it.effect("bounds recovery reads", boundedRecovery)
})

testIt.live("replays a terminal SQLite tree immediately after restart", () => {
  const filename = tempDbPath("tree-follow-restart")
  return Effect.gen(function* () {
    const seeded = yield* provideScoped(
      sqliteLayer(filename),
      Effect.gen(function* () {
        const store = yield* RunStore.RunStore
        const root = yield* startRoot("tree-follow:restart")
        const before = yield* RunTree.replay({ rootRunId: root.runId, limit: 100 })
        const claim = yield* store.claimExecution({ runId: root.runId, ownerId: "restart" })
        yield* store.emitAgentEvent({ ...claim, event: { _tag: "TurnStarted", turn: 13 } })
        yield* store.complete({ ...claim, result: completedResult("done") })
        const tail = yield* RunTree.replay({ rootRunId: root.runId, cursor: before.cursor, limit: 100 })
        return {
          rootRunId: root.runId,
          cursor: before.cursor,
          eventIds: tail.events.map(({ event }) => event.eventId),
        }
      }),
    )

    const replayed = yield* provideScoped(
      sqliteLayer(filename),
      RunTree.watch({ rootRunId: seeded.rootRunId, cursor: seeded.cursor }).pipe(Stream.runCollect),
    )
    expect(Array.from(replayed, ({ event }) => event.eventId)).toEqual(seeded.eventIds)
  })
})
