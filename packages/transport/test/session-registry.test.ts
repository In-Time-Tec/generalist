import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Exit, Fiber, Layer, Option, Ref, Schema, Scheduler, Stream } from "effect"
import { TestClock } from "effect/testing"
import { AiError, Chat, LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Persistence } from "effect/unstable/persistence"
import { Agent, Approvals, ModelMiddleware } from "@batonfx/core"
import { TestModel } from "@batonfx/test"
import { SessionRegistry, Wire } from "../src/index"

const provideTestLayer =
  <R, E, RIn>(layer: Layer.Layer<R, E, RIn>) =>
  <A, E2, R2>(effect: Effect.Effect<A, E2, R | R2>) =>
    Layer.build(layer).pipe(Effect.flatMap((context) => Effect.provide(effect, context)))

type ModelParams = Parameters<typeof LanguageModel.make>[0]

const modelLayer = (streamText: ModelParams["streamText"]) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText,
    }),
  )

const assistantText = (id: string, text: string) =>
  Stream.fromIterable([
    Response.makePart("text-start", { id }),
    Response.makePart("text-delta", { id, delta: text }),
    Response.makePart("text-end", { id }),
  ])

const toolCallPart = (id: string, name: string, params: unknown) =>
  Response.makePart("tool-call", { id, name, params, providerExecuted: false })

const collectThroughEnded = (sessionId: string, afterSeq?: number) =>
  SessionRegistry.SessionRegistry.use((registry) =>
    registry.attach(sessionId, afterSeq).pipe(
      Stream.takeUntil((frame) => frame._tag === "Ended"),
      Stream.runCollect,
    ),
  )

const persistenceLayer = Chat.layerPersisted({ storeId: "transport-test" }).pipe(
  Layer.provide(Persistence.layerBackingMemory),
)

const dependencies = (streamText: ModelParams["streamText"]) =>
  Layer.mergeAll(modelLayer(streamText), Approvals.autoApprove, ModelMiddleware.identityLayer, persistenceLayer)

const baseLayers = <Tools extends Record<string, Tool.Any>>(
  agent: Agent.Agent<Tools, false>,
  streamText: ModelParams["streamText"],
) => SessionRegistry.layerMemory({ agent }).pipe(Layer.provide(dependencies(streamText)))

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
    }).pipe(provideTestLayer(baseLayers(Agent.make({ name: "transport-agent" }), () => assistantText("reply", "ok")))),
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
    }).pipe(provideTestLayer(baseLayers(Agent.make({ name: "transport-agent" }), () => assistantText("reply", "ok")))),
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
    }).pipe(provideTestLayer(baseLayers(Agent.make({ name: "fast-agent" }), () => assistantText("reply", "ok")))),
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
      provideTestLayer(
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
        provideTestLayer(
          baseLayers(Agent.make({ name: "busy-agent" }), () =>
            Stream.unwrap(Deferred.await(release).pipe(Effect.as(assistantText("reply", "released")))),
          ),
        ),
      )
    })(),
  )

  it.effect("enqueues concurrent sends and drains them FIFO per session", () =>
    Effect.gen(function* () {
      const fixture = yield* TestModel.make([
        TestModel.turn([TestModel.text("first done")], { delay: "1 hour" }),
        TestModel.text("second done"),
        TestModel.text("third done"),
      ])
      yield* Effect.gen(function* () {
        yield* SessionRegistry.SessionRegistry.use((registry) => registry.open({ sessionId: "s-queued" }))
        const ended = yield* SessionRegistry.SessionRegistry.use((registry) =>
          registry.attach("s-queued").pipe(
            Stream.filter((frame) => frame._tag === "Ended"),
            Stream.take(3),
            Stream.runCollect,
            Effect.forkChild,
          ),
        )

        yield* SessionRegistry.SessionRegistry.use((registry) => registry.send("s-queued", "first"))
        yield* fixture.awaitRequests(1)
        yield* SessionRegistry.SessionRegistry.use((registry) => registry.send("s-queued", "second"))
        yield* SessionRegistry.SessionRegistry.use((registry) => registry.send("s-queued", "third"))

        const queued = yield* SessionRegistry.SessionRegistry.use((registry) => registry.info("s-queued"))
        expect(queued.pendingMessages).toBe(2)

        yield* TestClock.adjust("1 hour")
        yield* Fiber.join(ended)

        const recordedPrompts = yield* fixture.prompts
        const prompts = yield* Effect.forEach(recordedPrompts, (prompt) =>
          Schema.encodeUnknownEffect(Schema.UnknownFromJsonString)(prompt),
        )
        expect(prompts).toHaveLength(3)
        expect(prompts[0]).toContain("first")
        expect(prompts[1]).toContain("second")
        expect(prompts[2]).toContain("third")
        const drained = yield* SessionRegistry.SessionRegistry.use((registry) => registry.info("s-queued"))
        expect(drained.pendingMessages).toBe(0)
      }).pipe(
        provideTestLayer(
          SessionRegistry.layerMemory({
            agent: Agent.make({ name: "queued-agent" }),
            onConcurrentMessage: "enqueue",
          }).pipe(
            Layer.provide(
              Layer.mergeAll(fixture.layer, Approvals.autoApprove, ModelMiddleware.identityLayer, persistenceLayer),
            ),
          ),
        ),
      )
    }),
  )

  it.effect("caps concurrent runs across sessions", () => {
    let firstStarted: Deferred.Deferred<void>
    let secondStarted: Deferred.Deferred<void>
    let releaseFirst: Deferred.Deferred<void>
    let releaseSecond: Deferred.Deferred<void>
    let modelCalls = 0
    return Effect.gen(function* () {
      firstStarted = yield* Deferred.make<void>()
      secondStarted = yield* Deferred.make<void>()
      releaseFirst = yield* Deferred.make<void>()
      releaseSecond = yield* Deferred.make<void>()
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.open({ sessionId: "s-cap-a" }))
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.open({ sessionId: "s-cap-b" }))
      const firstEnded = yield* collectThroughEnded("s-cap-a").pipe(Effect.forkChild)
      const secondEnded = yield* collectThroughEnded("s-cap-b").pipe(Effect.forkChild)

      yield* SessionRegistry.SessionRegistry.use((registry) => registry.send("s-cap-a", "first"))
      yield* Deferred.await(firstStarted)
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.send("s-cap-b", "second"))
      yield* Effect.yieldNow
      yield* Effect.yieldNow

      expect(yield* Deferred.isDone(secondStarted)).toBe(false)
      yield* Deferred.succeed(releaseFirst, undefined)
      yield* Deferred.await(secondStarted)
      yield* Deferred.succeed(releaseSecond, undefined)
      yield* Fiber.join(firstEnded)
      yield* Fiber.join(secondEnded)
      expect(modelCalls).toBe(2)
    }).pipe(
      provideTestLayer(
        SessionRegistry.layerMemory({
          agent: Agent.make({ name: "capped-agent" }),
          maxConcurrentRuns: 1,
        }).pipe(
          Layer.provide(
            dependencies(() => {
              modelCalls += 1
              if (modelCalls === 1) {
                return Stream.unwrap(
                  Deferred.succeed(firstStarted, undefined).pipe(
                    Effect.andThen(Deferred.await(releaseFirst)),
                    Effect.as(assistantText("reply-a", "first done")),
                  ),
                )
              }
              return Stream.unwrap(
                Deferred.succeed(secondStarted, undefined).pipe(
                  Effect.andThen(Deferred.await(releaseSecond)),
                  Effect.as(assistantText("reply-b", "second done")),
                ),
              )
            }),
          ),
        ),
      ),
    )
  })

  it.effect("fails typed when the pending message queue is full", () => {
    let release: Deferred.Deferred<void>
    return Effect.gen(function* () {
      release = yield* Deferred.make<void>()
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.open({ sessionId: "s-queue-full" }))

      yield* SessionRegistry.SessionRegistry.use((registry) => registry.send("s-queue-full", "first"))
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.send("s-queue-full", "second"))
      const error = yield* Effect.flip(
        SessionRegistry.SessionRegistry.use((registry) => registry.send("s-queue-full", "third")),
      )

      expect(error._tag).toBe("@batonfx/transport/SessionQueueFull")
      yield* Deferred.succeed(release, undefined)
      yield* collectThroughEnded("s-queue-full")
    }).pipe(
      provideTestLayer(
        SessionRegistry.layerMemory({
          agent: Agent.make({ name: "queue-full-agent" }),
          onConcurrentMessage: "enqueue",
          pendingMessageCapacity: 1,
        }).pipe(
          Layer.provide(
            dependencies(() =>
              Stream.unwrap(Deferred.await(release).pipe(Effect.as(assistantText("reply", "released")))),
            ),
          ),
        ),
      ),
    )
  })

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
    }).pipe(provideTestLayer(baseLayers(Agent.make({ name: "replay-agent" }), () => assistantText("reply", "ok")))),
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
        provideTestLayer(
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
      const snapshotContent =
        snapshot[0]?._tag === "Snapshot"
          ? yield* Schema.encodeEffect(Schema.UnknownFromJsonString)(snapshot[0].transcript.content)
          : false
      expect(snapshotContent).toContain("snapshot prompt")
    }).pipe(
      provideTestLayer(
        SessionRegistry.layerMemory({
          agent: Agent.make({ name: "snapshot-agent" }),
          ringBufferCapacity: 2,
          stripTranscripts: true,
        }).pipe(Layer.provide(dependencies(() => assistantText("reply", "snap")))),
      ),
    ),
  )

  it.effect("cursorless attachment after truncation starts with a complete snapshot", () =>
    Effect.gen(function* () {
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.open({ sessionId: "s-cursorless-snapshot" }))
      const first = yield* collectThroughEnded("s-cursorless-snapshot").pipe(Effect.forkChild)
      yield* SessionRegistry.SessionRegistry.use((registry) =>
        registry.send("s-cursorless-snapshot", "complete prompt"),
      )
      yield* Fiber.join(first)

      const replay = yield* SessionRegistry.SessionRegistry.use((registry) =>
        registry.attach("s-cursorless-snapshot").pipe(Stream.take(1), Stream.runCollect),
      )

      expect(replay[0]?._tag).toBe("Snapshot")
      const content =
        replay[0]?._tag === "Snapshot"
          ? yield* Schema.encodeEffect(Schema.UnknownFromJsonString)(replay[0].transcript.content)
          : ""
      expect(content).toContain("complete prompt")
    }).pipe(
      provideTestLayer(
        SessionRegistry.layerMemory({
          agent: Agent.make({ name: "cursorless-snapshot-agent" }),
          ringBufferCapacity: 2,
          stripTranscripts: true,
        }).pipe(Layer.provide(dependencies(() => assistantText("reply", "complete reply")))),
      ),
    ),
  )

  it.effect("failed runs snapshot the accepted prompt and emitted response at the terminal boundary", () =>
    Effect.gen(function* () {
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.open({ sessionId: "s-failed-snapshot" }))
      const ended = yield* collectThroughEnded("s-failed-snapshot").pipe(Effect.forkChild)
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.send("s-failed-snapshot", "failed prompt"))
      yield* Fiber.join(ended)

      const replay = yield* SessionRegistry.SessionRegistry.use((registry) =>
        registry.attach("s-failed-snapshot").pipe(Stream.take(1), Stream.runCollect),
      )
      expect(replay[0]?._tag).toBe("Snapshot")
      const content =
        replay[0]?._tag === "Snapshot"
          ? yield* Schema.encodeEffect(Schema.UnknownFromJsonString)(replay[0].transcript.content)
          : ""
      expect(content).toContain("failed prompt")
      expect(content).toContain("partial response")
    }).pipe(
      provideTestLayer(
        SessionRegistry.layerMemory({
          agent: Agent.make({ name: "failed-snapshot-agent" }),
          ringBufferCapacity: 0,
          stripTranscripts: true,
        }).pipe(
          Layer.provide(
            dependencies(() =>
              Stream.concat(
                assistantText("partial", "partial response"),
                Stream.fail(
                  AiError.make({
                    module: "SessionRegistryTest",
                    method: "streamText",
                    reason: AiError.UnknownError.make({ description: "model failed" }),
                  }),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  )

  it.effect("refreshes persisted history between sessions that share a chat", () =>
    Effect.gen(function* () {
      const prompts = yield* Ref.make<ReadonlyArray<string>>([])
      let modelCalls = 0
      yield* Effect.gen(function* () {
        yield* SessionRegistry.SessionRegistry.use((registry) =>
          registry.open({ sessionId: "s-shared-first", chatId: "shared-chat" }),
        )
        yield* SessionRegistry.SessionRegistry.use((registry) =>
          registry.open({ sessionId: "s-shared-second", chatId: "shared-chat" }),
        )

        const firstEnded = yield* collectThroughEnded("s-shared-first").pipe(Effect.forkChild)
        yield* SessionRegistry.SessionRegistry.use((registry) => registry.send("s-shared-first", "first shared"))
        yield* Fiber.join(firstEnded)

        const secondEnded = yield* collectThroughEnded("s-shared-second").pipe(Effect.forkChild)
        yield* SessionRegistry.SessionRegistry.use((registry) => registry.send("s-shared-second", "second shared"))
        yield* Fiber.join(secondEnded)

        const recorded = yield* Ref.get(prompts)
        expect(recorded[1]).toContain("first shared")
        expect(recorded[1]).toContain("first reply")
        expect(recorded[1]).toContain("second shared")
      }).pipe(
        provideTestLayer(
          baseLayers(Agent.make({ name: "shared-chat-agent" }), (options) => {
            modelCalls += 1
            const reply = modelCalls === 1 ? "first reply" : "second reply"
            return Stream.concat(
              Stream.fromEffect(
                Schema.encodeEffect(Schema.UnknownFromJsonString)(options.prompt.content).pipe(
                  Effect.orDie,
                  Effect.flatMap((prompt) => Ref.update(prompts, (current) => [...current, prompt])),
                ),
              ).pipe(Stream.drain),
              assistantText(`shared-${modelCalls}`, reply),
            )
          }),
        ),
      )
    }),
  )

  it.effect("interrupt cancels an active run and finalizes session state", () => {
    let modelCalls = 0
    let started: Deferred.Deferred<void>
    return Effect.gen(function* () {
      started = yield* Deferred.make<void>()
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.open({ sessionId: "s-interrupt" }))
      const firstFiber = yield* collectThroughEnded("s-interrupt").pipe(Effect.forkChild)
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.send("s-interrupt", "first"))
      yield* Deferred.await(started)

      yield* SessionRegistry.SessionRegistry.use((registry) => registry.interrupt("s-interrupt"))

      const info = yield* SessionRegistry.SessionRegistry.use((registry) => registry.info("s-interrupt"))
      expect(info.status._tag).toBe("Failed")

      const first = yield* Fiber.join(firstFiber)
      expect(first.some((frame) => frame._tag === "Failed")).toBe(true)
      expect(first.at(-1)?._tag).toBe("Ended")

      const secondFiber = yield* collectThroughEnded("s-interrupt", first.at(-1)?.seq).pipe(Effect.forkChild)
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.send("s-interrupt", "second"))
      const second = yield* Fiber.join(secondFiber)
      expect(second.some((frame) => frame._tag === "Event" && frame.event._tag === "Completed")).toBe(true)
    }).pipe(
      provideTestLayer(
        baseLayers(Agent.make({ name: "interrupt-agent" }), () => {
          modelCalls += 1
          if (modelCalls === 1) {
            return Stream.unwrap(Deferred.succeed(started, undefined).pipe(Effect.as(Stream.fromEffect(Effect.never))))
          }
          return assistantText("reply", "after interrupt")
        }),
      ),
    )
  })

  it.effect("interrupt retains accepted prompts and starts the next queued run", () => {
    let firstStarted: Deferred.Deferred<void>
    let modelCalls = 0
    return Effect.gen(function* () {
      firstStarted = yield* Deferred.make<void>()
      const frames = yield* Ref.make<Array<Wire.LooseServerFrameType>>([])
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.open({ sessionId: "s-interrupt-queue" }))
      const ended = yield* SessionRegistry.SessionRegistry.use((registry) =>
        registry.attach("s-interrupt-queue").pipe(
          Stream.tap((frame) => Ref.update(frames, (current) => [...current, frame])),
          Stream.filter((frame) => frame._tag === "Ended"),
          Stream.take(2),
          Stream.runCollect,
          Effect.forkChild,
        ),
      )

      yield* SessionRegistry.SessionRegistry.use((registry) => registry.send("s-interrupt-queue", "first"))
      yield* Deferred.await(firstStarted)
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.send("s-interrupt-queue", "second"))
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.interrupt("s-interrupt-queue"))
      yield* Fiber.join(ended)

      const info = yield* SessionRegistry.SessionRegistry.use((registry) => registry.info("s-interrupt-queue"))
      const recorded = yield* Ref.get(frames)
      expect(modelCalls).toBe(2)
      expect(info.pendingMessages).toBe(0)
      expect(info.status._tag).toBe("Idle")
      expect(recorded.filter((frame) => frame._tag === "Failed")).toHaveLength(1)
      expect(recorded.some((frame) => frame._tag === "Event" && frame.event._tag === "Completed")).toBe(true)
    }).pipe(
      provideTestLayer(
        SessionRegistry.layerMemory({
          agent: Agent.make({ name: "interrupt-queue-agent" }),
          onConcurrentMessage: "enqueue",
        }).pipe(
          Layer.provide(
            dependencies(() => {
              modelCalls += 1
              if (modelCalls === 1) {
                return Stream.unwrap(Deferred.succeed(firstStarted, undefined).pipe(Effect.andThen(Effect.never)))
              }
              return assistantText("reply", "after interrupt")
            }),
          ),
        ),
      ),
    )
  })

  it.effect("rejects invalid queue governance options while building the layer", () =>
    Effect.gen(function* () {
      const pendingCapacity = yield* SessionRegistry.SessionRegistry.use((registry) =>
        registry.open({ sessionId: "invalid-pending-capacity" }),
      ).pipe(
        provideTestLayer(
          SessionRegistry.layerMemory({
            agent: Agent.make({ name: "invalid-pending-capacity-agent" }),
            pendingMessageCapacity: 1.5,
          }).pipe(Layer.provide(dependencies(() => assistantText("reply", "unused")))),
        ),
        Effect.exit,
      )
      const concurrency = yield* SessionRegistry.SessionRegistry.use((registry) =>
        registry.open({ sessionId: "invalid-concurrency" }),
      ).pipe(
        provideTestLayer(
          SessionRegistry.layerMemory({
            agent: Agent.make({ name: "invalid-concurrency-agent" }),
            maxConcurrentRuns: 0,
          }).pipe(Layer.provide(dependencies(() => assistantText("reply", "unused")))),
        ),
        Effect.exit,
      )

      expect(Exit.hasDies(pendingCapacity)).toBe(true)
      expect(Exit.hasDies(concurrency)).toBe(true)
    }),
  )

  it.effect("interrupt landing before the run fiber is recorded still cancels the run", () => {
    const awaitRunning: Effect.Effect<void, SessionRegistry.SessionError, SessionRegistry.SessionRegistry> =
      SessionRegistry.SessionRegistry.use((registry) => registry.info("s-stop-race")).pipe(
        Effect.flatMap((current) => (current.status._tag === "Running" ? Effect.void : awaitRunning)),
      )
    const stopDuringSend = Effect.gen(function* () {
      const sendFiber = yield* SessionRegistry.SessionRegistry.use((registry) =>
        registry.send("s-stop-race", "go"),
      ).pipe(Effect.forkChild)
      yield* awaitRunning
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.interrupt("s-stop-race"))
      yield* Fiber.join(sendFiber)
    }).pipe(Effect.provideService(Scheduler.MaxOpsBeforeYield, 3))
    return Effect.gen(function* () {
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.open({ sessionId: "s-stop-race" }))
      yield* Effect.forEach(
        Array.from({ length: 8 }),
        () =>
          SessionRegistry.SessionRegistry.use((registry) =>
            registry.attach("s-stop-race").pipe(Stream.runDrain, Effect.forkChild),
          ),
        { discard: true },
      )
      yield* stopDuringSend

      const info = yield* SessionRegistry.SessionRegistry.use((registry) => registry.info("s-stop-race"))
      expect(info.status._tag).toBe("Failed")
    }).pipe(
      provideTestLayer(baseLayers(Agent.make({ name: "stop-race-agent" }), () => Stream.fromEffect(Effect.never))),
    )
  })

  it.effect("stale predecessor registration cannot clear a successor interruption", () => {
    let releaseFirst: Deferred.Deferred<void>
    let secondStarted: Deferred.Deferred<void>
    let modelCalls = 0
    const awaitStatus = (
      predicate: (status: Wire.SessionStatus) => boolean,
    ): Effect.Effect<void, SessionRegistry.SessionError, SessionRegistry.SessionRegistry> =>
      SessionRegistry.SessionRegistry.use((registry) => registry.info("s-successor-stop")).pipe(
        Effect.flatMap((info) =>
          predicate(info.status) ? Effect.void : Effect.yieldNow.pipe(Effect.andThen(awaitStatus(predicate))),
        ),
      )
    return Effect.gen(function* () {
      releaseFirst = yield* Deferred.make<void>()
      secondStarted = yield* Deferred.make<void>()
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.open({ sessionId: "s-successor-stop" }))
      const firstSend = yield* SessionRegistry.SessionRegistry.use((registry) =>
        registry.send("s-successor-stop", "first"),
      ).pipe(Effect.forkChild)

      yield* awaitStatus((status) => status._tag === "Running")
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.send("s-successor-stop", "second"))
      yield* Deferred.succeed(releaseFirst, undefined)
      yield* Deferred.await(secondStarted)
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.interrupt("s-successor-stop"))
      yield* awaitStatus((status) => status._tag === "Failed")
      yield* Fiber.join(firstSend)

      const info = yield* SessionRegistry.SessionRegistry.use((registry) => registry.info("s-successor-stop"))
      expect(modelCalls).toBe(2)
      expect(info.pendingMessages).toBe(0)
      expect(info.status._tag).toBe("Failed")
    }).pipe(
      provideTestLayer(
        SessionRegistry.layerMemory({
          agent: Agent.make({ name: "successor-stop-agent" }),
          onConcurrentMessage: "enqueue",
        }).pipe(
          Layer.provide(
            dependencies(() => {
              modelCalls += 1
              if (modelCalls === 1) {
                return Stream.unwrap(
                  Deferred.await(releaseFirst).pipe(Effect.as(assistantText("first-reply", "first complete"))),
                )
              }
              return Stream.unwrap(Deferred.succeed(secondStarted, undefined).pipe(Effect.andThen(Effect.never)))
            }),
          ),
        ),
      ),
      Effect.provideService(Scheduler.MaxOpsBeforeYield, 3),
    )
  })

  it.effect("emits suspension as data and resolves approved approvals", () => {
    const gated = Tool.make("gated", {
      parameters: Schema.Struct({ text: Schema.String }),
      success: Schema.String,
      needsApproval: true,
    })
    const toolkit = Toolkit.make(gated)
    const agent = Agent.make({ name: "approval-agent", toolkit })
    let calls = 0
    let handled = false
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

      expect(handled).toBe(true)
      expect(second.some((frame) => frame._tag === "Event" && frame.event._tag === "Completed")).toBe(true)
      expect(second.at(-1)?._tag).toBe("Ended")
    }).pipe(
      provideTestLayer(
        SessionRegistry.layerMemory({ agent }).pipe(
          Layer.provide(
            Layer.mergeAll(
              modelLayer(() => {
                calls += 1
                if (calls === 1) return Stream.make(toolCallPart("call-approval", "gated", { text: "approved" }))
                return assistantText("reply", "approved done")
              }),
              toolkit.toLayer({
                gated: () =>
                  Effect.sync(() => {
                    handled = true
                    return "approved"
                  }),
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

  it.effect("resumes approval before queued prompts and protects accepted work from idle eviction", () => {
    const gated = Tool.make("gated", {
      parameters: Schema.Struct({ text: Schema.String }),
      success: Schema.String,
      needsApproval: true,
    })
    const toolkit = Toolkit.make(gated)
    const agent = Agent.make({ name: "approval-queue-agent", toolkit })
    const awaitSuspended: Effect.Effect<void, SessionRegistry.SessionError, SessionRegistry.SessionRegistry> =
      SessionRegistry.SessionRegistry.use((registry) => registry.info("s-approval-queue")).pipe(
        Effect.flatMap((current) => (current.status._tag === "Suspended" ? Effect.void : awaitSuspended)),
      )
    let modelCalls = 0
    let handled = false
    let secondSawHandled = false
    return Effect.gen(function* () {
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.open({ sessionId: "s-approval-queue" }))
      const ended = yield* SessionRegistry.SessionRegistry.use((registry) =>
        registry.attach("s-approval-queue").pipe(
          Stream.filter((frame) => frame._tag === "Ended"),
          Stream.take(3),
          Stream.runCollect,
          Effect.forkChild,
        ),
      )

      yield* SessionRegistry.SessionRegistry.use((registry) => registry.send("s-approval-queue", "needs approval"))
      yield* awaitSuspended
      yield* SessionRegistry.SessionRegistry.use((registry) => registry.send("s-approval-queue", "queued prompt"))
      yield* TestClock.adjust("20 millis")
      const queued = yield* SessionRegistry.SessionRegistry.use((registry) => registry.info("s-approval-queue"))
      expect(queued.pendingMessages).toBe(1)

      yield* SessionRegistry.SessionRegistry.use((registry) =>
        registry.resolveApproval("s-approval-queue", "approval-token", { _tag: "Approved" }),
      )
      yield* Fiber.join(ended)

      const completed = yield* SessionRegistry.SessionRegistry.use((registry) => registry.info("s-approval-queue"))
      expect(modelCalls).toBe(3)
      expect(handled).toBe(true)
      expect(secondSawHandled).toBe(true)
      expect(completed.pendingMessages).toBe(0)
      expect(completed.status._tag).toBe("Idle")
    }).pipe(
      provideTestLayer(
        SessionRegistry.layerMemory({
          agent,
          onConcurrentMessage: "enqueue",
          idleTimeout: "10 millis",
        }).pipe(
          Layer.provide(
            Layer.mergeAll(
              modelLayer(() => {
                modelCalls += 1
                if (modelCalls === 1) return Stream.make(toolCallPart("call-approval-queue", "gated", { text: "ok" }))
                if (modelCalls === 2) secondSawHandled = handled
                return assistantText(`reply-${modelCalls}`, `run ${modelCalls} done`)
              }),
              toolkit.toLayer({
                gated: () =>
                  Effect.sync(() => {
                    handled = true
                    return "approved"
                  }),
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
    const gated = Tool.make("gated", {
      parameters: Schema.Struct({ text: Schema.String }),
      success: Schema.String,
      needsApproval: true,
    })
    const toolkit = Toolkit.make(gated)
    const agent = Agent.make({ name: "one-shot-approval-agent", toolkit })
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
      provideTestLayer(
        SessionRegistry.layerMemory({ agent }).pipe(
          Layer.provide(
            Layer.mergeAll(
              modelLayer(() => {
                modelCalls += 1
                if (modelCalls === 1) return Stream.make(toolCallPart("call-repeat", "gated", { text: "first" }))
                if (modelCalls === 2) return Stream.make(toolCallPart("call-repeat", "gated", { text: "second" }))
                return assistantText("reply", "done")
              }),
              toolkit.toLayer({ gated: () => Effect.succeed("approved") }),
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
