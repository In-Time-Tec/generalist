import { expect, it, layer } from "@effect/vitest"
import { Effect, Fiber, Layer, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, ToolExecutor } from "@batonfx/core"
import { Address, Errors, ExecutionHost, ExecutableResolver, Runtime, RunStore } from "../src/index.js"
import { assistantAddress, emptyTranscript, memoryLayer, registrationsFor } from "./helpers.js"
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

const ackAddress = Address.make("agent:ack-agent")

/** Scripted two-turn agent: cycle 1 calls a tool, cycle 2 finishes. */
const twoTurnLayer = () => {
  const tool = Tool.make("ack_tool", {
    parameters: Schema.Struct({}),
    success: Schema.String,
  })
  const toolkit = Toolkit.make(tool)
  const agent = Agent.make({ name: "ack-agent", toolkit })
  const ref = testExecutable(agent, "ack-v1")
  const address = ackAddress
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
                  id: "call_1",
                  name: "ack_tool",
                  params: {},
                  providerExecuted: false,
                }),
                finish,
              ]
            : [Response.makePart("text-delta", { id: "text:2", delta: "done" }), finish],
        )
      },
    }),
  )
  const executor = ToolExecutor.layerTest({
    execute: () => Effect.succeed({ _tag: "Success" as const, result: "ok", encodedResult: "ok" }),
  })
  const handlers = toolkit.toLayer({ ack_tool: () => Effect.die("ToolExecutor test layer owns execution") })
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
  }
}

layer(memoryLayer)("Runtime host-acknowledged checkpoint memory contract", (test) => {
  test.effect("starts at the origin and reads the acknowledged point back", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:ack-origin",
        idempotencyKey: "run:ack-origin",
        prompt: "start",
      })
      expect(yield* runtime.acknowledged(receipt.runId)).toEqual({ runId: receipt.runId, sequence: -1 })
    }),
  )

  test.effect("is idempotent and monotonic, and a future ack fails typed", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:ack-rules",
        idempotencyKey: "run:ack-rules",
        prompt: "start",
      })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "ack-rules" })
      yield* store.emitAgentEvent({
        ...claim,
        event: { _tag: "TurnCompleted", turn: 1, transcript: emptyTranscript },
      })
      yield* store.emitAgentEvent({
        ...claim,
        event: { _tag: "TurnCompleted", turn: 2, transcript: emptyTranscript },
      })
      const committed = (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })).filter(
        (event) => event._tag === "TurnCompleted",
      )
      expect(committed).toHaveLength(2)
      const cycle1 = committed[0]!.sequence
      const cycle2 = committed[1]!.sequence

      yield* runtime.acknowledge({ runId: receipt.runId, sequence: cycle1 })
      yield* runtime.acknowledge({ runId: receipt.runId, sequence: cycle1 })
      yield* runtime.acknowledge({ runId: receipt.runId, sequence: cycle2 })
      // An older ack is a no-op.
      yield* runtime.acknowledge({ runId: receipt.runId, sequence: cycle1 })
      expect((yield* runtime.acknowledged(receipt.runId)).sequence).toBe(cycle2)

      // A future ack fails typed.
      const future = yield* runtime.acknowledge({ runId: receipt.runId, sequence: cycle2 + 1 }).pipe(Effect.flip)
      expect(future).toBeInstanceOf(Errors.AckBeyondCommitted)
      if (Schema.is(Errors.AckBeyondCommitted)(future)) {
        expect(future.lastCommittedSequence).toBe(cycle2)
      }

      // A sequence below the cursor origin is invalid.
      const invalid = yield* runtime.acknowledge({ runId: receipt.runId, sequence: -2 }).pipe(Effect.flip)
      expect(invalid).toBeInstanceOf(Errors.AckInvalid)

      // The ack never moved past the last committed boundary.
      expect((yield* runtime.acknowledged(receipt.runId)).sequence).toBe(cycle2)
    }),
  )

  test.effect("a run without a completed cycle rejects any ack beyond the origin", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:ack-no-cycle",
        idempotencyKey: "run:ack-no-cycle",
        prompt: "start",
      })
      yield* runtime.acknowledge({ runId: receipt.runId, sequence: -1 })
      expect((yield* runtime.acknowledged(receipt.runId)).sequence).toBe(-1)
      const future = yield* runtime.acknowledge({ runId: receipt.runId, sequence: 0 }).pipe(Effect.flip)
      expect(future).toBeInstanceOf(Errors.AckBeyondCommitted)
      if (Schema.is(Errors.AckBeyondCommitted)(future)) {
        expect(future.lastCommittedSequence).toBe(-1)
      }
    }),
  )

  test.effect("fails RunNotFound for an unknown Run", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      expect(yield* runtime.acknowledge({ runId: "run:missing", sequence: 0 }).pipe(Effect.flip)).toBeInstanceOf(
        Errors.RunNotFound,
      )
      expect(yield* runtime.acknowledged("run:missing").pipe(Effect.flip)).toBeInstanceOf(Errors.RunNotFound)
    }),
  )
})

it.live("host acks cycle N, disconnects, and resumes exactly after N across a SQLite restart", () => {
  const filename = tempDbPath("runtime-ack-restart")
  const ackSqliteLayer = twoTurnLayer().sqlite
  let runId = ""
  let acked = -1
  let full: Array<{ eventId: string; sequence: number; _tag: string }> = []

  const firstHost = provideScoped(
    ackSqliteLayer(filename),
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const host = yield* ExecutionHost.ExecutionHost
      const receipt = yield* runtime.send({
        to: ackAddress,
        sessionId: "session:ack-restart",
        idempotencyKey: "run:ack-restart",
        prompt: "start",
      })
      runId = receipt.runId
      const claim = yield* store.claimExecution({ runId, ownerId: "first-host" })
      const fiber = yield* host.execute(claim).pipe(Effect.forkChild({ startImmediately: true }))
      const observed = yield* runtime.events({ runId }).pipe(
        Stream.takeWhile((event) => !isTerminalTag(event._tag)),
        Stream.tap((event) =>
          event._tag === "TurnCompleted"
            ? Effect.sync(() => {
                acked = event.sequence
              }).pipe(Effect.andThen(runtime.acknowledge({ runId, sequence: event.sequence })))
            : Effect.void,
        ),
        Stream.runCollect,
        Effect.forkChild({ startImmediately: true }),
      )
      yield* Fiber.join(fiber)
      yield* Fiber.join(observed)
      full = (yield* runtime.history({ runId, cursor: -1, limit: 1000 })).map((event) => ({
        eventId: event.eventId,
        sequence: event.sequence,
        _tag: event._tag,
      }))
      expect(full.filter((event) => event._tag === "TurnCompleted")).toHaveLength(2)
      expect(acked).toBeGreaterThanOrEqual(0)
      expect((yield* runtime.acknowledged(runId)).sequence).toBe(acked)
    }),
  )

  const resumedHost = provideScoped(
    ackSqliteLayer(filename),
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const point = yield* runtime.acknowledged(runId)
      expect(point.sequence).toBe(acked)
      const expected = full.filter((event) => event.sequence > point.sequence)
      const observed = yield* runtime.events({ runId, cursor: point.sequence }).pipe(
        Stream.take(expected.length),
        Stream.runCollect,
        Effect.map((chunk) => [...chunk]),
      )
      expect(observed).toHaveLength(expected.length)
      for (let index = 0; index < expected.length; index += 1) {
        expect(observed[index]?.eventId).toBe(expected[index]?.eventId)
        expect(observed[index]?.sequence).toBe(expected[index]?.sequence)
        expect(observed[index]?._tag).toBe(expected[index]?._tag)
      }
      // No gaps and no duplicates: strictly consecutive sequences after the ack.
      expect(observed.map((event) => event.sequence)).toEqual(
        Array.from({ length: expected.length }, (_, index) => point.sequence + 1 + index),
      )
      // A future ack still fails typed after the restart.
      const future = yield* runtime.acknowledge({ runId, sequence: full.at(-1)!.sequence + 1 }).pipe(Effect.flip)
      expect(future).toBeInstanceOf(Errors.AckBeyondCommitted)
    }),
  )

  return firstHost.pipe(Effect.andThen(resumedHost))
})

it.live("a host that never acks is unaffected and still replays the full stream after restart", () => {
  const filename = tempDbPath("runtime-ack-never")
  const ackSqliteLayer = twoTurnLayer().sqlite
  let runId = ""

  const firstHost = provideScoped(
    ackSqliteLayer(filename),
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const host = yield* ExecutionHost.ExecutionHost
      const receipt = yield* runtime.send({
        to: ackAddress,
        sessionId: "session:ack-never",
        idempotencyKey: "run:ack-never",
        prompt: "start",
      })
      runId = receipt.runId
      yield* host.execute(yield* store.claimExecution({ runId, ownerId: "first-host" }))
      expect((yield* runtime.inspect(runId)).status).toBe("succeeded")
      expect((yield* runtime.acknowledged(runId)).sequence).toBe(-1)
    }),
  )

  const resumedHost = provideScoped(
    ackSqliteLayer(filename),
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      expect((yield* runtime.acknowledged(runId)).sequence).toBe(-1)
      const inspection = yield* runtime.inspect(runId)
      const observed = yield* runtime.events({ runId, cursor: -1 }).pipe(
        Stream.take(inspection.lastSequence + 1),
        Stream.runCollect,
        Effect.map((chunk) => [...chunk]),
      )
      expect(observed).toHaveLength(inspection.lastSequence + 1)
      expect(observed.map((event) => event.sequence)).toEqual(
        Array.from({ length: observed.length }, (_, index) => index),
      )
    }),
  )

  return firstHost.pipe(Effect.andThen(resumedHost))
})
