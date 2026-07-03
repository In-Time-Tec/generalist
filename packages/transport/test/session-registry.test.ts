import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Exit, Fiber, Layer, Option, Schema, Stream } from "effect"
import { TestClock } from "effect/testing"
import * as Ai from "effect/unstable/ai"
import { Persistence } from "effect/unstable/persistence"
import { Agent, Approvals, ModelMiddleware, ToolExecutor } from "@batonfx/core"
import { SessionRegistry } from "../src/index"

type ModelParams = Parameters<typeof Ai.LanguageModel.make>[0]

const modelLayer = (streamText: ModelParams["streamText"]) =>
  Layer.effect(
    Ai.LanguageModel.LanguageModel,
    Ai.LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText,
    }),
  )

const assistantText = (id: string, text: string) =>
  Stream.fromIterable([
    Ai.Response.makePart("text-start", { id }),
    Ai.Response.makePart("text-delta", { id, delta: text }),
    Ai.Response.makePart("text-end", { id }),
  ])

const toolCallPart = (id: string, name: string, params: unknown) =>
  Ai.Response.makePart("tool-call", { id, name, params, providerExecuted: false })

const collectThroughEnded = (sessionId: string, afterSeq?: number) =>
  SessionRegistry.SessionRegistry.use((registry) =>
    registry.attach(sessionId, afterSeq).pipe(
      Stream.takeUntil((frame) => frame._tag === "Ended"),
      Stream.runCollect,
    ),
  )

const persistenceLayer = Ai.Chat.layerPersisted({ storeId: "transport-test" }).pipe(
  Layer.provide(Persistence.layerBackingMemory),
)

const dependencies = (streamText: ModelParams["streamText"]) =>
  Layer.mergeAll(
    modelLayer(streamText),
    ToolExecutor.testLayer({ execute: () => Effect.die("unexpected tool execution") }),
    Approvals.autoApprove,
    ModelMiddleware.identityLayer,
    persistenceLayer,
  )

const baseLayers = (agent: Agent.Agent<Record<string, Ai.Tool.Any>>, streamText: ModelParams["streamText"]) =>
  SessionRegistry.layerMemory({ agent }).pipe(Layer.provide(dependencies(streamText)))

describe("SessionRegistry.layerMemory", () => {
  it.effect("open returns idle session info", () =>
    Effect.gen(function* () {
      const info = yield* SessionRegistry.SessionRegistry.use((registry) =>
        registry.open({ sessionId: "s-open", chatId: "c-open" }),
      )

      expect(info.sessionId).toBe("s-open")
      expect(info.chatId).toBe("c-open")
      expect(info.lastSeq).toBe(-1)
      expect(info.status._tag).toBe("Idle")
    }).pipe(Effect.provide(baseLayers(Agent.make({ name: "transport-agent" }), () => assistantText("reply", "ok")))),
  )

  it.effect("send publishes monotonic event frames and ended", () =>
    Effect.gen(function* () {
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.open({ sessionId: "s-run" }))
      const fiber = yield* collectThroughEnded("s-run").pipe(Effect.forkChild)

      yield* SessionRegistry.SessionRegistry.use((registry) => registry.send("s-run", "hello"))
      const frames = yield* Fiber.join(fiber)

      expect(frames.map((frame) => frame.seq)).toEqual(frames.map((_, index) => index))
      expect(frames.some((frame) => frame._tag === "SessionStatus" && frame.status._tag === "Running")).toBe(true)
      expect(frames.some((frame) => frame._tag === "Event" && frame.event._tag === "Completed")).toBe(true)
      expect(frames.at(-1)?._tag).toBe("Ended")
    }).pipe(Effect.provide(baseLayers(Agent.make({ name: "transport-agent" }), () => assistantText("reply", "ok")))),
  )

  it.effect("fast completed runs keep idle status and idleSince", () =>
    Effect.gen(function* () {
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.open({ sessionId: "s-fast" }))
      const fiber = yield* collectThroughEnded("s-fast").pipe(Effect.forkChild)

      yield* SessionRegistry.SessionRegistry.use((registry) => registry.send("s-fast", "hello"))
      yield* Fiber.join(fiber)
      const info = yield* SessionRegistry.SessionRegistry.use((registry) => registry.info("s-fast"))

      expect(info.status._tag).toBe("Idle")
      expect(Option.isSome(info.idleSince)).toBe(true)
    }).pipe(Effect.provide(baseLayers(Agent.make({ name: "fast-agent" }), () => assistantText("reply", "ok")))),
  )

  it.effect("idle eviction terminates active attachments and removes the session", () =>
    Effect.gen(function* () {
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.open({ sessionId: "s-evict" }))
      const fiber = yield* SessionRegistry.SessionRegistry.use((registry) =>
        registry.attach("s-evict").pipe(Stream.runDrain, Effect.exit, Effect.forkChild),
      )
      yield* Effect.yieldNow

      yield* TestClock.adjust("20 millis")
      const exit = yield* Fiber.join(fiber)
      const missing = yield* Effect.flip(SessionRegistry.SessionRegistry.use((registry) => registry.info("s-evict")))

      expect(Exit.isFailure(exit)).toBe(true)
      expect(missing._tag).toBe("@batonfx/transport/SessionError")
    }).pipe(
      Effect.provide(
        SessionRegistry.layerMemory({ agent: Agent.make({ name: "evict-agent" }), idleTimeout: "10 millis" }).pipe(
          Layer.provide(dependencies(() => assistantText("reply", "ok"))),
        ),
      ),
    ),
  )

  it.effect("rejects concurrent sends while a run is active", () =>
    (() => {
      let release: Deferred.Deferred<void>
      return Effect.gen(function* () {
        release = yield* Deferred.make<void>()
        yield* SessionRegistry.SessionRegistry.use((registry) => registry.open({ sessionId: "s-busy" }))

        yield* SessionRegistry.SessionRegistry.use((registry) => registry.send("s-busy", "first"))
        const busy = yield* Effect.flip(
          SessionRegistry.SessionRegistry.use((registry) => registry.send("s-busy", "second")),
        )
        expect(busy._tag).toBe("@batonfx/transport/SessionBusy")

        yield* Deferred.succeed(release, undefined)
        const frames = yield* collectThroughEnded("s-busy")
        expect(frames.at(-1)?._tag).toBe("Ended")
      }).pipe(
        Effect.provide(
          baseLayers(Agent.make({ name: "busy-agent" }), () =>
            Stream.unwrap(Deferred.await(release).pipe(Effect.as(assistantText("reply", "released")))),
          ),
        ),
      )
    })(),
  )

  it.effect("replays only frames after the requested cursor", () =>
    Effect.gen(function* () {
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.open({ sessionId: "s-replay" }))
      const firstFiber = yield* collectThroughEnded("s-replay").pipe(Effect.forkChild)
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.send("s-replay", "hello"))
      const first = yield* Fiber.join(firstFiber)
      const cursor = first[1]?.seq ?? 0

      const replay = yield* collectThroughEnded("s-replay", cursor)
      expect(replay.length).toBeGreaterThan(0)
      expect(replay.every((frame) => frame.seq > cursor)).toBe(true)
    }).pipe(Effect.provide(baseLayers(Agent.make({ name: "replay-agent" }), () => assistantText("reply", "ok")))),
  )

  it.effect("lagging subscribers fail without blocking other subscribers", () =>
    (() => {
      let releaseSlow: Deferred.Deferred<void>
      return Effect.gen(function* () {
        releaseSlow = yield* Deferred.make<void>()
        const slowStarted = yield* Deferred.make<void>()
        yield* SessionRegistry.SessionRegistry.use((registry) => registry.open({ sessionId: "s-lag" }))
        const slowFiber = yield* SessionRegistry.SessionRegistry.use((registry) =>
          registry.attach("s-lag").pipe(
            Stream.tap(() =>
              Deferred.succeed(slowStarted, undefined).pipe(Effect.andThen(Deferred.await(releaseSlow))),
            ),
            Stream.runDrain,
            Effect.flip,
            Effect.forkDetach,
          ),
        )
        yield* Effect.yieldNow

        yield* SessionRegistry.SessionRegistry.use((registry) => registry.send("s-lag", "hello"))
        yield* Deferred.await(slowStarted)
        yield* Effect.yieldNow
        yield* Deferred.succeed(releaseSlow, undefined)
        const slowError = yield* Fiber.join(slowFiber)
        const replay = yield* collectThroughEnded("s-lag")

        expect(replay.at(-1)?._tag).toBe("Ended")
        expect(slowError._tag).toBe("@batonfx/transport/SubscriberLagged")
        if (slowError._tag === "@batonfx/transport/SubscriberLagged") {
          expect(slowError.lastDeliveredSeq).toBe(1)
        }
      }).pipe(
        Effect.provide(
          SessionRegistry.layerMemory({ agent: Agent.make({ name: "lag-agent" }), subscriberQueueCapacity: 1 }).pipe(
            Layer.provide(dependencies(() => assistantText("reply", "ok"))),
          ),
        ),
      )
    })(),
  )

  it.effect("stale cursors receive a snapshot even when transcripts are stripped", () =>
    Effect.gen(function* () {
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.open({ sessionId: "s-snapshot" }))
      const fiber = yield* collectThroughEnded("s-snapshot").pipe(Effect.forkChild)
      yield* Effect.yieldNow
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.send("s-snapshot", "snapshot prompt"))
      const frames = yield* Fiber.join(fiber)
      const completed = frames.find((frame) => frame._tag === "Event" && frame.event._tag === "Completed")
      expect(
        completed?._tag === "Event" && completed.event._tag === "Completed" && completed.event.transcript,
      ).toBeUndefined()

      const snapshot = yield* SessionRegistry.SessionRegistry.use((registry) =>
        registry.attach("s-snapshot", 0).pipe(Stream.take(1), Stream.runCollect),
      )
      expect(snapshot[0]?._tag).toBe("Snapshot")
      expect(snapshot[0]?._tag === "Snapshot" && JSON.stringify(snapshot[0].transcript.content)).toContain(
        "snapshot prompt",
      )
    }).pipe(
      Effect.provide(
        SessionRegistry.layerMemory({
          agent: Agent.make({ name: "snapshot-agent" }),
          ringBufferCapacity: 2,
          stripTranscripts: true,
        }).pipe(Layer.provide(dependencies(() => assistantText("reply", "snap")))),
      ),
    ),
  )

  it.effect("emits suspension as data and resolves approved approvals", () => {
    const gated = Ai.Tool.make("gated", {
      parameters: Schema.Struct({ text: Schema.String }),
      success: Schema.String,
      needsApproval: true,
    })
    const agent = Agent.make({ name: "approval-agent", toolkit: Ai.Toolkit.make(gated) })
    let calls = 0
    return Effect.gen(function* () {
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.open({ sessionId: "s-approval" }))
      const firstFiber = yield* collectThroughEnded("s-approval").pipe(Effect.forkChild)
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.send("s-approval", "needs approval"))
      const first = yield* Fiber.join(firstFiber)
      const suspended = first.find((frame) => frame._tag === "Suspended")

      expect(suspended?._tag).toBe("Suspended")
      expect(first.at(-1)?._tag).toBe("Ended")

      const secondFiber = yield* collectThroughEnded("s-approval", first.at(-1)?.seq).pipe(Effect.forkChild)
      yield* SessionRegistry.SessionRegistry.use((registry) =>
        registry.resolveApproval("s-approval", "approval-token", { _tag: "Approved" }),
      )
      const second = yield* Fiber.join(secondFiber)

      expect(second.some((frame) => frame._tag === "Event" && frame.event._tag === "Completed")).toBe(true)
      expect(second.at(-1)?._tag).toBe("Ended")
    }).pipe(
      Effect.provide(
        SessionRegistry.layerMemory({ agent }).pipe(
          Layer.provide(
            Layer.mergeAll(
              modelLayer((options) => {
                calls += 1
                const content = JSON.stringify(options.prompt.content)
                if (calls === 1) return Stream.make(toolCallPart("call-approval", "gated", { text: "approved" }))
                expect(content).toContain("approved")
                return assistantText("reply", "approved done")
              }),
              ToolExecutor.testLayer({
                execute: () => Effect.succeed({ _tag: "Success", result: "approved", encodedResult: "approved" }),
              }),
              Approvals.testLayer({ check: () => Effect.succeed({ _tag: "Pending", token: "approval-token" }) }),
              ModelMiddleware.identityLayer,
              persistenceLayer,
            ),
          ),
        ),
      ),
    )
  })

  it.effect("approval resolution override is consumed after the resumed call", () => {
    const gated = Ai.Tool.make("gated", {
      parameters: Schema.Struct({ text: Schema.String }),
      success: Schema.String,
      needsApproval: true,
    })
    const agent = Agent.make({ name: "one-shot-approval-agent", toolkit: Ai.Toolkit.make(gated) })
    let modelCalls = 0
    let approvalChecks = 0
    return Effect.gen(function* () {
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.open({ sessionId: "s-approval-one-shot" }))
      const firstFiber = yield* collectThroughEnded("s-approval-one-shot").pipe(Effect.forkChild)
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.send("s-approval-one-shot", "needs approval"))
      const first = yield* Fiber.join(firstFiber)

      expect(first.some((frame) => frame._tag === "Suspended")).toBe(true)

      const secondFiber = yield* collectThroughEnded("s-approval-one-shot", first.at(-1)?.seq).pipe(Effect.forkChild)
      yield* SessionRegistry.SessionRegistry.use((registry) =>
        registry.resolveApproval("s-approval-one-shot", "approval-token", { _tag: "Approved" }),
      )
      const second = yield* Fiber.join(secondFiber)
      const secondSuspended = second.find((frame) => frame._tag === "Suspended")

      expect(secondSuspended?._tag === "Suspended" && secondSuspended.suspension.token).toBe("second-token")
      expect(approvalChecks).toBe(2)
    }).pipe(
      Effect.provide(
        SessionRegistry.layerMemory({ agent }).pipe(
          Layer.provide(
            Layer.mergeAll(
              modelLayer(() => {
                modelCalls += 1
                if (modelCalls === 1) return Stream.make(toolCallPart("call-repeat", "gated", { text: "first" }))
                if (modelCalls === 2) return Stream.make(toolCallPart("call-repeat", "gated", { text: "second" }))
                return assistantText("reply", "done")
              }),
              ToolExecutor.testLayer({
                execute: () => Effect.succeed({ _tag: "Success", result: "approved", encodedResult: "approved" }),
              }),
              Approvals.testLayer({
                check: () =>
                  Effect.sync(() => {
                    approvalChecks += 1
                    return { _tag: "Pending" as const, token: approvalChecks === 1 ? "approval-token" : "second-token" }
                  }),
              }),
              ModelMiddleware.identityLayer,
              persistenceLayer,
            ),
          ),
        ),
      ),
    )
  })
})
