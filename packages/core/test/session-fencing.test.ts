import { expect, layer } from "@effect/vitest"
import { Effect, Layer, Option, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Response } from "effect/unstable/ai"
import { Agent, AgentEvent, Approvals, Compaction, ModelMiddleware, Session, ToolExecutor } from "../src/index"
import { ItLayer } from "./it-layer"
import { Json } from "./json"
import { unusedToolHandlerLayer } from "./tool-handler-layer"
import { withProviderFinish } from "./provider-finish"

type ModelParams = Parameters<typeof LanguageModel.make>[0]

const modelLayer = (streamText: ModelParams["streamText"]) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: (options) => withProviderFinish(streamText(options)),
    }),
  )

const unusedExecutor = ToolExecutor.layerTest({
  execute: () => Effect.die("unexpected tool execution"),
})

const textDelta = (delta: string) => Response.makePart("text-delta", { id: "text", delta })

layer(Layer.mergeAll(unusedToolHandlerLayer, Agent.layerRuntime))("Session fencing", (it) => {
  ItLayer.make(it, "forwards the session owner token on every message append", () => {
    const appendOptions: Array<Session.AppendOptions | undefined> = []
    const capturingSession = Layer.effect(
      Session.SessionStore,
      Effect.gen(function* () {
        const inner = yield* Session.SessionStore
        return Session.SessionStore.of({
          ...inner,
          append: (entry, options) => {
            appendOptions.push(options)
            return inner.append(entry, options)
          },
        })
      }),
    ).pipe(Layer.provide(Session.layerMemory))
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(textDelta("done"))),
        capturingSession,
        Compaction.layerTest({ maybeCompact: () => Effect.succeed(Option.none()) }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "fenced-append-agent" })
        const events = yield* Stream.runCollect(
          Agent.stream(agent, { prompt: "hello", sessionOwnerToken: "execution:turn-1:epoch:7" }),
        )
        expect(events.at(-1)?._tag).toBe("Completed")
        expect(appendOptions.length).toBeGreaterThan(0)
        expect(appendOptions.every((options) => options?.ownerToken === "execution:turn-1:epoch:7")).toBe(true)
      }),
    ] as const
  })

  ItLayer.make(it, "forwards the session owner token on compaction checkpoints", () => {
    const checkpoints: Array<Session.PreparedCheckpoint> = []
    const capturingSession = Layer.effect(
      Session.SessionStore,
      Effect.gen(function* () {
        const inner = yield* Session.SessionStore
        return Session.SessionStore.of({
          ...inner,
          appendCheckpoint: (checkpoint) => {
            checkpoints.push(checkpoint)
            return inner.appendCheckpoint(checkpoint)
          },
        })
      }),
    ).pipe(Layer.provide(Session.layerMemory))
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(textDelta("done"))),
        capturingSession,
        Compaction.layerTest({
          maybeCompact: (request) =>
            Effect.succeed(
              Option.some({
                _tag: "Microcompact" as const,
                history: Prompt.make("compacted history"),
                prompt: Prompt.make("compacted prompt"),
              }),
            ).pipe(Compaction.withLifecycle(request)),
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "fenced-checkpoint-agent" })
        const events = yield* Stream.runCollect(
          Agent.stream(agent, {
            prompt: "original prompt",
            compaction: { contextWindow: 10 },
            sessionOwnerToken: "execution:turn-1:epoch:7",
          }),
        )
        expect(events.at(-1)?._tag).toBe("Completed")
        expect(checkpoints.length).toBeGreaterThan(0)
        expect(checkpoints.every((checkpoint) => checkpoint.ownerToken === "execution:turn-1:epoch:7")).toBe(true)
      }),
    ] as const
  })

  ItLayer.make(it, "surfaces a fenced session append as a typed loop failure", () => {
    const fenced = Session.SessionConflict.make({ reason: "fenced", message: "stale session writer" })
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(textDelta("done"))),
        Session.layerTest({
          reserveEntryId: Effect.succeed("entry-1"),
          append: () => Effect.fail(fenced),
          appendCheckpoint: () => Effect.die("unused"),
          path: () => Effect.succeed([]),
          setLeaf: () => Effect.void,
          leaf: Effect.succeed(null),
        }),
        Compaction.layerTest({ maybeCompact: () => Effect.succeed(Option.none()) }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "stale-writer-agent" })
        const failure = yield* Effect.flip(
          Stream.runDrain(Agent.stream(agent, { prompt: "hello", sessionOwnerToken: "stale-owner" })),
        )
        expect(Schema.is(AgentEvent.AgentError)(failure)).toBe(true)
        if (!Schema.is(AgentEvent.AgentError)(failure)) return
        expect(failure.message).toBe("stale session writer")
        expect(Schema.is(Session.SessionConflict)(failure.cause)).toBe(true)
        if (Schema.is(Session.SessionConflict)(failure.cause)) expect(failure.cause.reason).toBe("fenced")
      }),
    ] as const
  })

  ItLayer.make(it, "attaches bounded divergence diagnostics to the prefix invariant failure", () => {
    const seed = Prompt.makeMessage("user", {
      content: [Prompt.makePart("text", { text: "durable-secret-seed" })],
    })
    const other = Prompt.makeMessage("user", {
      content: [Prompt.makePart("text", { text: "authoritative-secret-other" })],
    })
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(textDelta("done"))),
        Session.layerMemory,
        Compaction.layerTest({ maybeCompact: () => Effect.succeed(Option.none()) }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const session = yield* Session.SessionStore
        yield* session.append({ _tag: "Message", message: seed })
        const agent = Agent.make({ name: "diverged-agent" })
        const failure = yield* Effect.flip(
          Stream.runDrain(
            Agent.stream(agent, {
              prompt: "next",
              history: Prompt.fromMessages([other]),
              sessionId: "session-diverged",
              sessionOwnerToken: "owner-diverged",
            }),
          ),
        )
        expect(Schema.is(AgentEvent.AgentError)(failure)).toBe(true)
        if (!Schema.is(AgentEvent.AgentError)(failure)) return
        expect(failure.message).toBe("Session projection is not a prefix of authoritative Chat history")
        const diagnostics = failure.diagnostics
        expect(diagnostics?.sessionId).toBe("session-diverged")
        expect(diagnostics?.ownerToken).toBe("owner-diverged")
        expect(diagnostics?.durableMessageCount).toBe(1)
        expect(diagnostics?.authoritativeMessageCount).toBeGreaterThanOrEqual(1)
        expect(diagnostics?.alignmentCount).toBe(0)
        expect(diagnostics?.commonPrefixLength).toBe(0)
        expect(diagnostics?.firstDivergence?.durableRole).toBe("user")
        expect(diagnostics?.firstDivergence?.durablePartTypes).toEqual(["text"])
        const encoded = Json.stringify(diagnostics)
        expect(encoded).not.toContain("secret")
      }),
    ] as const
  })
})
