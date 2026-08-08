import { expect, it } from "@effect/vitest"
import { Deferred, Duration, Effect, Fiber, Layer, Option, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, ToolExecutor } from "@batonfx/core"
import { Address, Errors, ExecutionHost, ExecutableResolver, Runtime, RunStore } from "../src/index.js"
import type { RunEvent } from "../src/run-event.js"
import { registrationsFor } from "./helpers.js"
import { testExecutable } from "./identity.js"
import { tempDbPath } from "./sqlite-helpers.js"
import { provideScoped } from "./scoped-provide.js"

const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

const isTerminalTag = (tag: string): boolean => tag === "RunCompleted" || tag === "RunFailed" || tag === "RunCancelled"

interface Fixture {
  readonly memory: ReturnType<typeof Runtime.layerMemory>
  readonly sqlite: (filename: string) => ReturnType<typeof Runtime.layerSqlite>
  readonly address: Address.Address
  readonly requests: Array<string>
}

/**
 * A scripted two-cycle agent: cycle 1 streams two tool calls, cycle 2 finishes.
 * The same fixture produces identical output on every fresh host, so tool-call ids
 * are deterministic across process restarts.
 */
const makeFixture = (name: string): Fixture => {
  const tool = Tool.make("conformance_tool", {
    parameters: Schema.Struct({}),
    success: Schema.String,
  })
  const toolkit = Toolkit.make(tool)
  const agent = Agent.make({ name, toolkit })
  const ref = testExecutable(agent, "conformance-v1")
  const address = Address.make(`agent:${name}`)
  const requests: Array<string> = []
  const model = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: (request) => {
        requests.push(JSON.stringify(request.prompt))
        return Stream.fromIterable<Response.StreamPartEncoded>(
          requests.length === 1
            ? [
                Response.makePart("tool-call", {
                  id: "call_conformance_1",
                  name: "conformance_tool",
                  params: {},
                  providerExecuted: false,
                }),
                Response.makePart("tool-call", {
                  id: "call_conformance_2",
                  name: "conformance_tool",
                  params: {},
                  providerExecuted: false,
                }),
                finish,
              ]
            : [Response.makePart("text-delta", { id: "text:conformance", delta: "done" }), finish],
        )
      },
    }),
  )
  const executor = ToolExecutor.layerTest({
    execute: () => Effect.succeed({ _tag: "Success" as const, result: "ok", encodedResult: "ok" }),
  })
  const handlers = toolkit.toLayer({ conformance_tool: () => Effect.die("ToolExecutor test layer owns execution") })
  const agentLayer = () => Agent.close(agent, Layer.mergeAll(model, executor, handlers))
  return {
    memory: Runtime.layerMemory({
      resolver: ExecutableResolver.makeStatic([{ executable: ref, agent: agentLayer() }]),
      addresses: [{ address, executable: ref, registrations: registrationsFor(ref) }],
    }),
    sqlite: (filename: string) =>
      Runtime.layerSqlite({
        filename,
        resolver: ExecutableResolver.makeStatic([{ executable: ref, agent: agentLayer() }]),
        addresses: [{ address, executable: ref, registrations: registrationsFor(ref) }],
      }),
    address,
    requests,
  }
}

type LayerValue = ReturnType<Fixture["sqlite"]> | Fixture["memory"]

const toolCallIds = (events: ReadonlyArray<RunEvent>): ReadonlyArray<string> =>
  events
    .filter(
      (event): event is Extract<RunEvent, { readonly _tag: "ToolExecutionStarted" }> =>
        event._tag === "ToolExecutionStarted",
    )
    .map((event) => event.call.id)

/**
 * R1 — Multi-observer cursor-based subscription: two consumers attach to one running Run,
 * both receive the full ordered stream, both replay from an arbitrary cursor after disconnect,
 * and the streams never diverge.
 */
const verifyTwoObserversNeverDiverge = (layerValue: LayerValue, address: Address.Address, key: string) =>
  provideScoped(
    layerValue,
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const host = yield* ExecutionHost.ExecutionHost
      const receipt = yield* runtime.send({
        to: address,
        sessionId: `session:${key}`,
        idempotencyKey: key,
        prompt: "start",
      })
      const runId = receipt.runId
      const claim = yield* store.claimExecution({ runId, ownerId: "conformance" })
      const execution = yield* host.execute(claim).pipe(Effect.forkChild({ startImmediately: true }))
      const collect = (cursor = -1) =>
        runtime.events({ runId, cursor }).pipe(
          Stream.takeUntil((event) => isTerminalTag(event._tag)),
          Stream.runCollect,
          Effect.map((chunk) =>
            [...chunk].map((event) => ({
              eventId: event.eventId,
              sequence: event.sequence,
              _tag: event._tag,
            })),
          ),
        )
      const observerA = yield* collect().pipe(Effect.forkChild({ startImmediately: true }))
      const observerB = yield* collect().pipe(Effect.forkChild({ startImmediately: true }))
      yield* Fiber.join(execution)
      const streamA = yield* Fiber.join(observerA)
      const streamB = yield* Fiber.join(observerB)

      // Both consumers received the same full ordered stream, terminal event included.
      expect(streamA).toEqual(streamB)
      expect(streamA.map((event) => event.sequence)).toEqual(
        Array.from({ length: streamA.length }, (_, index) => index),
      )
      expect(streamA.at(-1)?._tag).toBe("RunCompleted")

      // Observer A disconnects and replays from an arbitrary cursor; the replay matches B's tail.
      const cursor = streamA[2]!.sequence
      const replayed = yield* collect(cursor)
      expect(replayed).toEqual(streamB.filter((event) => event.sequence > cursor))

      // Streams never diverge: the same cursor replays identically every time.
      expect(yield* collect(cursor)).toEqual(replayed)
    }),
  )

it.live("R1 two observers on one running Run receive identical ordered streams and never diverge (memory)", () =>
  Effect.gen(function* () {
    const fixture = makeFixture("r1-memory")
    yield* verifyTwoObserversNeverDiverge(fixture.memory, fixture.address, "r1-memory")
  }),
)

it.live("R1 two observers on one running Run receive identical ordered streams and never diverge (sqlite)", () =>
  Effect.gen(function* () {
    const fixture = makeFixture("r1-sqlite")
    yield* verifyTwoObserversNeverDiverge(fixture.sqlite(tempDbPath("conformance-r1")), fixture.address, "r1-sqlite")
  }),
)

/**
 * R2 — Durability of the checkpoint boundary: TurnCompleted is durable with a stable
 * sequence/eventId and atomically persists the transcript across a process restart.
 */
it.live(
  "R2 TurnCompleted keeps a stable sequence/eventId and atomically persists the transcript across restart",
  () => {
    const filename = tempDbPath("conformance-r2")
    const fixture = makeFixture("r2-agent")
    let runId = ""
    let committed: Array<{ eventId: string; sequence: number; transcript: unknown }> = []

    const firstHost = provideScoped(
      fixture.sqlite(filename),
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const host = yield* ExecutionHost.ExecutionHost
        const receipt = yield* runtime.send({
          to: fixture.address,
          sessionId: "session:r2",
          idempotencyKey: "r2",
          prompt: "start",
        })
        runId = receipt.runId
        yield* host.execute(yield* store.claimExecution({ runId, ownerId: "r2" }))
        const history = yield* runtime.history({ runId, cursor: -1, limit: 1000 })
        committed = history
          .filter((event) => event._tag === "TurnCompleted")
          .map((event) => ({ eventId: event.eventId, sequence: event.sequence, transcript: event.transcript }))
        expect(committed).toHaveLength(2)
        expect(committed[0]!.eventId).toBe(`${runId}:${committed[0]!.sequence}`)
      }),
    )

    const reopenedHost = provideScoped(
      fixture.sqlite(filename),
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const history = yield* runtime.history({ runId, cursor: -1, limit: 1000 })
        const replayed = history
          .filter((event) => event._tag === "TurnCompleted")
          .map((event) => ({ eventId: event.eventId, sequence: event.sequence, transcript: event.transcript }))
        expect(replayed).toEqual(committed)
        // The transcript and cleared continuation were committed atomically with the boundary.
        const execution = yield* store.loadExecution(runId)
        expect(execution.transcript).toEqual(committed.at(-1)!.transcript)
        expect(execution.continuation).toBeUndefined()
      }),
    )

    return firstHost.pipe(Effect.andThen(reopenedHost))
  },
)

/**
 * R3 — Stable tool-call ids: the same turn run twice in fresh host processes yields identical
 * tool-call ids for the same model output, and a mid-turn reconnect replays already-emitted ids
 * unchanged.
 */
it.live("R3 the same turn run twice in fresh host processes yields identical tool-call ids", () => {
  const fixtureA = makeFixture("r3-a")
  const fixtureB = makeFixture("r3-b")
  let idsFirst: ReadonlyArray<string> = []

  const firstHost = provideScoped(
    fixtureA.sqlite(tempDbPath("conformance-r3-a")),
    Effect.gen(function* () {
      const { history } = yield* runAndCollect(fixtureA, "r3-a")
      idsFirst = toolCallIds(history)
      expect(idsFirst).toEqual(["call_conformance_1", "call_conformance_2"])
    }),
  )

  const secondHost = provideScoped(
    fixtureB.sqlite(tempDbPath("conformance-r3-b")),
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const { runId, history } = yield* runAndCollect(fixtureB, "r3-b")
      const idsSecond = toolCallIds(history)
      expect(idsSecond).toEqual(idsFirst)

      // A mid-turn reconnect replays already-emitted tool-call ids unchanged from durable history.
      const firstTool = history.find((event) => event._tag === "ToolExecutionStarted")!
      const replay = yield* runtime.events({ runId, cursor: firstTool.sequence - 1 }).pipe(
        Stream.takeUntil((event) => isTerminalTag(event._tag)),
        Stream.runCollect,
        Effect.map((chunk) => [...chunk]),
      )
      expect(toolCallIds(replay)).toEqual(idsSecond)
    }),
  )

  return firstHost.pipe(Effect.andThen(secondHost))
})

/** Admit a Run and execute it to completion through the embedded ExecutionHost. */
const runAndCollect = (fixture: Fixture, key: string) =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore.RunStore
    const host = yield* ExecutionHost.ExecutionHost
    const receipt = yield* runtime.send({
      to: fixture.address,
      sessionId: `session:${key}`,
      idempotencyKey: key,
      prompt: "start",
    })
    const runId = receipt.runId
    yield* host.execute(yield* store.claimExecution({ runId, ownerId: "conformance" }))
    const history = yield* runtime.history({ runId, cursor: -1, limit: 1000 })
    return { runId, history }
  })

/**
 * R4 — Durable steering: steer is durable and idempotent (same key succeeds, changed prompt
 * fails SteeringConflict), SteeringDrained is emitted at the next turn boundary, and a steer
 * near completion is consumed or fails typed — never silently dropped.
 */
it.live("R4 steering is durable, idempotent, drained at the next turn boundary, and never silently dropped", () => {
  const filename = tempDbPath("conformance-r4")
  const fixture = makeFixture("r4-agent")
  let runId = ""

  const firstHost = provideScoped(
    fixture.sqlite(filename),
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const host = yield* ExecutionHost.ExecutionHost
      const receipt = yield* runtime.send({
        to: fixture.address,
        sessionId: "session:r4",
        idempotencyKey: "r4",
        prompt: "start",
      })
      runId = receipt.runId
      // Durable + idempotent: an equivalent duplicate succeeds; a changed prompt conflicts.
      yield* runtime.steer({ runId, idempotencyKey: "steer:r4", prompt: "redirect" })
      yield* runtime.steer({ runId, idempotencyKey: "steer:r4", prompt: "redirect" })
      const conflict = yield* runtime.steer({ runId, idempotencyKey: "steer:r4", prompt: "changed" }).pipe(Effect.flip)
      expect(conflict).toBeInstanceOf(Errors.SteeringConflict)

      // A steer near completion is consumed into the next turn, never dropped.
      yield* host.execute(yield* store.claimExecution({ runId, ownerId: "r4" }))
      expect((yield* runtime.inspect(runId)).status).toBe("succeeded")
      expect(fixture.requests).toHaveLength(2)
      // The steer was consumed atomically with the next model operation, never silently dropped.
      expect(fixture.requests[1]).toContain("redirect")
      const history = yield* runtime.history({ runId, cursor: -1, limit: 1000 })
      const drained = history.filter((event) => event._tag === "SteeringDrained")
      expect(drained).toHaveLength(1)
      const modelAttempts = history
        .map((event, index) => ({ event, index }))
        .filter(({ event }) => event._tag === "ModelAttemptStarted")
      expect(history.findIndex((event) => event._tag === "SteeringDrained")).toBeLessThan(modelAttempts[1]!.index)

      // Steering after the terminal is a typed failure, never a silent drop.
      const terminal = yield* runtime.steer({ runId, idempotencyKey: "steer:late", prompt: "late" }).pipe(Effect.flip)
      expect(terminal).toBeInstanceOf(Errors.RunTerminal)
    }),
  )

  const reopenedHost = provideScoped(
    fixture.sqlite(filename),
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const history = yield* runtime.history({ runId, cursor: -1, limit: 1000 })
      expect(history.filter((event) => event._tag === "SteeringDrained")).toHaveLength(1)
      expect((yield* runtime.inspect(runId)).status).toBe("succeeded")
    }),
  )

  return firstHost.pipe(Effect.andThen(reopenedHost))
})

/**
 * R5 — Prompt interruption: a cancel issued mid-stream terminates the model stream and produces
 * a typed cancelled terminal within one model-chunk boundary. The stream never completes on its
 * own; only interruption ends it.
 */
it.live("R5 cancel issued mid-stream terminates the model stream with a typed cancelled terminal", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const interrupted = yield* Deferred.make<void>()
    const agent = Agent.make({ name: "r5-agent" })
    const ref = testExecutable(agent, "r5-v1")
    const address = Address.make("agent:r5-agent")
    const requests: Array<string> = []
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.never,
        streamText: (request) => {
          requests.push(JSON.stringify(request.prompt))
          return Stream.fromEffect(Deferred.succeed(started, undefined)).pipe(
            Stream.flatMap(() => Stream.make(Response.makePart("text-delta", { id: "chunk:1", delta: "first" }))),
            Stream.concat(Stream.never),
            Stream.ensuring(Deferred.succeed(interrupted, undefined).pipe(Effect.asVoid)),
          )
        },
      }),
    )
    const runtimeLayer = Runtime.layerMemory({
      resolver: ExecutableResolver.makeStatic([{ executable: ref, agent: Agent.close(agent, model) }]),
      addresses: [{ address, executable: ref, registrations: registrationsFor(ref) }],
    })

    yield* provideScoped(
      runtimeLayer,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const host = yield* ExecutionHost.ExecutionHost
        const receipt = yield* runtime.send({
          to: address,
          sessionId: "session:r5",
          idempotencyKey: "r5",
          prompt: "wait",
        })
        const runId = receipt.runId
        const claim = yield* store.claimExecution({ runId, ownerId: "r5" })
        const execution = yield* host.execute(claim).pipe(Effect.forkChild({ startImmediately: true }))
        const events = yield* runtime.events({ runId }).pipe(
          Stream.takeUntil((event) => isTerminalTag(event._tag)),
          Stream.runCollect,
          Effect.map((chunk) => [...chunk].map((event) => event._tag)),
          Effect.forkChild({ startImmediately: true }),
        )
        yield* Deferred.await(started)
        expect(requests).toHaveLength(1)
        yield* runtime.cancel({ runId, reason: "stop the prompt" })
        // One model chunk was emitted; the typed cancelled terminal must arrive without another
        // chunk or the stream ending on its own.
        const tags = yield* Effect.timeoutOption(Fiber.join(events), Duration.seconds(10))
        expect(Option.isSome(tags)).toBe(true)
        if (Option.isSome(tags)) {
          expect(tags.value.at(-1)).toBe("RunCancelled")
          expect(
            tags.value.filter((tag) => tag === "RunCompleted" || tag === "RunFailed" || tag === "RunCancelled"),
          ).toEqual(["RunCancelled"])
        }
        expect(yield* Deferred.await(interrupted).pipe(Effect.as(true))).toBe(true)
        expect(requests).toHaveLength(1)
        expect((yield* Fiber.await(execution))._tag).toBe("Success")
        expect((yield* runtime.inspect(runId)).status).toBe("cancelled")
      }),
    )
  }),
)
