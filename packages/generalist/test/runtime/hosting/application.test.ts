import { BunCrypto } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Exit, Fiber, Layer, Ref, Schema, Scope, Stream } from "effect"
import { TestClock } from "effect/testing"
import { LanguageModel, Response } from "effect/unstable/ai"
import { Agent } from "generalist"
import { ObjectStore } from "generalist/durability/object-store"
import { Address, Inspection, Runtime } from "generalist/runtime"
import { ClientEvent } from "generalist/server"
import { makeObjectStorage } from "../execution/object.js"
import { provideScoped } from "../execution/scoped-provide.js"

const namespace = { environment: "test", tenant: "semantic-runtime", partition: "application" }
const usage = Response.Usage.make({
  inputTokens: { uncached: 1, total: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
})
const modelLayer = (text: string, called: Effect.Effect<void> = Effect.void) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text }]),
      streamText: () =>
        Stream.fromEffect(called).pipe(
          Stream.flatMap(() =>
            Stream.make(
              Response.makePart("text-delta", { id: "answer", delta: text }),
              Response.makePart("finish", { reason: "stop", usage, response: undefined }),
            ),
          ),
        ),
    }),
  )

const makeFixture = Effect.gen(function* () {
  const storage = makeObjectStorage()
  const creates = yield* Ref.make(0)
  const store = ObjectStore.of({
    ...storage.store,
    create: (...args) => Ref.update(creates, (count) => count + 1).pipe(Effect.andThen(storage.store.create(...args))),
  })
  return { storage: Layer.merge(Layer.succeed(ObjectStore, store), BunCrypto.layer), creates }
})

describe("semantic Runtime admission", () => {
  it.effect("publishes only semantic commands and bounded canonical observations", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture
      const assistant = Agent.make({ name: "assistant" })
      yield* provideScoped(
        Runtime.layer({
          agents: { assistant },
          revision: "assistant-v1",
          services: modelLayer("done"),
          storage: fixture.storage,
          namespace,
        }),
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          expect(Object.isFrozen(runtime)).toBe(true)
          expect(Object.keys(runtime).toSorted()).toEqual(
            [
              "start",
              "hold",
              "schedule",
              "inspect",
              "list",
              "events",
              "history",
              "previews",
              "signal",
              "respond",
              "cancel",
              "sessions",
              "children",
              "messaging",
              "operator",
            ].toSorted(),
          )
          const held = yield* runtime.hold(assistant, "inspect without dispatch", { idempotencyKey: "inspect" })
          const view = yield* runtime.inspect(held.runId)
          expect(view).toMatchObject({ agent: "assistant", revision: "assistant-v1", status: "pending" })
          expect(yield* Schema.decodeEffect(Inspection.Run)(view)).toEqual(view)
          expect(yield* runtime.list({ status: "pending", limit: 10 })).toEqual([view])
          expect(yield* runtime.children.list(held.runId)).toEqual([])
          const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(view)
          for (const key of [
            "ownerId",
            "attemptFence",
            "executableManifest",
            "executableRef",
            "checkpoint",
            "registrations",
          ]) {
            expect(encoded).not.toContain(key)
          }
        }),
      )
    }),
  )

  it.effect("retires retained semantic handles, reads, commands, and streams without writes", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture
      const assistant = Agent.make({ name: "assistant" })
      const scope = yield* Scope.make()
      const context = yield* Layer.build(
        Runtime.layer({
          agents: { assistant },
          revision: "assistant-v1",
          services: modelLayer("done"),
          storage: fixture.storage,
          namespace,
        }),
      ).pipe(Scope.provide(scope))
      const runtime = Context.get(context, Runtime.Runtime)
      const held = yield* runtime.hold(assistant, "remain held", { idempotencyKey: "held" })
      const session = yield* runtime.sessions.create({ sessionId: "inbox" })
      yield* session.control("stop", "stop")
      yield* Scope.close(scope, Exit.void)
      const before = yield* Ref.get(fixture.creates)
      const retired = <A, E>(effect: Effect.Effect<A, E>) =>
        effect.pipe(
          Effect.flip,
          Effect.tap((error) =>
            Effect.sync(() => expect(error).toMatchObject({ _tag: "generalist/runtime/RuntimeRetired" })),
          ),
        )
      yield* Effect.all([
        retired(runtime.start(assistant, "retired")),
        retired(runtime.hold(assistant, "retired", { idempotencyKey: "retired" })),
        retired(runtime.schedule(assistant, "retired", { rrule: "FREQ=DAILY", sessionId: "inbox" })),
        retired(runtime.inspect(held.runId)),
        retired(runtime.list({ limit: 10 })),
        retired(runtime.history({ runId: held.runId, limit: 10 })),
        retired(runtime.signal({ runId: held.runId, name: "signal", commandId: "signal" })),
        retired(runtime.respond({ runId: held.runId, waitId: "wait", resolution: { _tag: "Approved" } })),
        retired(runtime.cancel({ runId: held.runId, commandId: "cancel" })),
        retired(runtime.sessions.create({ sessionId: "new" })),
        retired(runtime.sessions.get("inbox")),
        retired(runtime.sessions.list),
        retired(session.inspect),
        retired(session.queue),
        retired(session.submit(assistant, "retired", { commandId: "submit" })),
        retired(
          session.update({ id: "task", expectedRevision: 1, commandId: "update", agent: assistant, value: "retired" }),
        ),
        retired(session.remove({ id: "task", expectedRevision: 1, commandId: "remove" })),
        retired(session.control("resume", "resume")),
        retired(held.activate("activate")),
        retired(held.send("retired")),
        retired(held.await),
        retired(runtime.children.list(held.runId)),
        retired(runtime.children.inspect({ parentRunId: held.runId, childRunId: "child" })),
        retired(runtime.children.settlements({ parentRunId: held.runId, limit: 10 })),
        retired(
          runtime.messaging.send({
            fromRunId: held.runId,
            to: Address.make("missing"),
            idempotencyKey: "message",
            prompt: "retired",
          }),
        ),
        retired(runtime.operator.explain(held.runId)),
        retired(runtime.operator.verify(held.runId)),
        retired(runtime.operator.retry(held.runId, "operator", "retry")),
        retired(runtime.operator.wake(held.runId, "operator", "wake")),
        retired(runtime.operator.extendBudget(held.runId, { tokens: 1 }, "operator", "budget")),
        retired(Stream.runCollect(runtime.events({ runId: held.runId }))),
        retired(Stream.runCollect(held.events)),
        retired(Stream.runCollect(session.events())),
        retired(Stream.runCollect(runtime.children.settlementChanges({ parentRunId: held.runId }))),
        retired(Stream.runCollect(runtime.operator.scanObligations())),
      ])
      expect(yield* Stream.runCollect(runtime.previews({ runId: held.runId }))).toEqual([])
      expect(yield* Ref.get(fixture.creates)).toBe(before)
    }),
  )

  it.effect("holds one typed Agent without dispatch until its handle activates it", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture
      const calls = yield* Ref.make(0)
      const assistant = Agent.make({ name: "assistant", input: Schema.Struct({ task: Schema.String }) })
      const live = Runtime.layer({
        agents: { assistant },
        revision: "assistant-v1",
        services: modelLayer(
          "done",
          Ref.update(calls, (count) => count + 1),
        ),
        storage: fixture.storage,
        namespace,
      })
      yield* provideScoped(
        live,
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const held = yield* runtime.hold(assistant, { task: "report" }, { idempotencyKey: "hold-report" })
          const retry = yield* runtime.hold(assistant, { task: "report" }, { idempotencyKey: "hold-report" })
          expect(retry.runId).toBe(held.runId)
          expect(yield* Ref.get(calls)).toBe(0)
          yield* held.activate("activate-report")
          const completion = yield* Effect.forkChild(held.await)
          yield* TestClock.adjust("1 second")
          expect(yield* Fiber.join(completion)).toBe("done")
          expect(yield* Ref.get(calls)).toBe(1)
          yield* held.activate("activate-report")
          expect(yield* Ref.get(calls)).toBe(1)
        }),
      )
    }),
  )

  it.effect("admits a Session task without a parent and preserves immutable command receipts", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture
      const assistant = Agent.make({ name: "assistant", input: Schema.Struct({ task: Schema.String }) })
      const unregistered = Agent.make({ name: "unregistered" })
      const live = Runtime.layer({
        agents: { assistant },
        revision: "assistant-v1",
        services: modelLayer("done"),
        storage: fixture.storage,
        namespace,
      })
      yield* provideScoped(
        live,
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const session = yield* runtime.sessions.create({ sessionId: "inbox", title: "Inbox" })
          yield* session.control("stop", "stop-inbox")
          const receipt = yield* session.submit(assistant, { task: "report" }, { commandId: "report" })
          expect(receipt).toEqual({ sessionId: "inbox", id: "report", revision: 1 })
          expect(yield* session.inspect).toMatchObject({ lifecycle: "stopped", queuedInputs: 1, runCount: 0 })
          const beforeRetry = yield* Ref.get(fixture.creates)
          expect(yield* session.submit(assistant, { task: "report" }, { commandId: "report" })).toEqual(receipt)
          expect(yield* Ref.get(fixture.creates)).toBe(beforeRetry)
          expect(
            yield* session.submit(assistant, { task: "changed" }, { commandId: "report" }).pipe(Effect.flip),
          ).toMatchObject({
            _tag: "generalist/session/IdempotencyConflict",
            sessionId: "inbox",
            commandId: "report",
          })
          expect(
            yield* session.submit(unregistered, "report", { commandId: "unknown" }).pipe(Effect.flip),
          ).toMatchObject({
            _tag: "generalist/runtime/UnknownAgent",
            agentName: "unregistered",
          })
          expect(yield* session.queue).toMatchObject([{ id: "report", revision: 1, agent: "assistant" }])
          const updated = yield* session.update({
            id: receipt.id,
            expectedRevision: 1,
            commandId: "update-report",
            agent: assistant,
            value: { task: "revised" },
          })
          expect(updated).toEqual({ sessionId: "inbox", id: "report", revision: 2 })
          expect(yield* session.submit(assistant, { task: "report" }, { commandId: "report" })).toEqual(receipt)
          expect(yield* session.queue).toMatchObject([{ id: "report", revision: 2 }])
          expect(
            yield* session.remove({ id: "report", expectedRevision: 1, commandId: "stale-remove" }).pipe(Effect.flip),
          ).toMatchObject({
            _tag: "generalist/session/SessionQueueConflict",
            reason: "revision",
          })
          yield* session.remove({ id: "report", expectedRevision: 2, commandId: "remove-report" })
          expect(yield* session.queue).toEqual([])
        }),
      )
    }),
  )

  it.effect("replays a queued command after replacement without changing its exact executable revision", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture
      const original = Agent.make({ name: "assistant" })
      const replacement = Agent.make({ name: "assistant" })
      const oldServices = modelLayer("original")
      const initial = Runtime.layer({
        agents: { assistant: original },
        revision: "v1",
        services: oldServices,
        storage: fixture.storage,
        namespace,
      })
      const receipt = yield* provideScoped(
        initial,
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const session = yield* runtime.sessions.create({ sessionId: "inbox" })
          yield* session.control("stop", "pause")
          return yield* session.submit(original, "queued work", { commandId: "queued" })
        }),
      )
      const loaded = yield* Ref.make<ReadonlyArray<string>>([])
      const next = Runtime.layer({
        agents: { assistant: replacement },
        revision: "v2",
        services: modelLayer("replacement"),
        storage: fixture.storage,
        namespace,
        loadRevision: (request) =>
          Ref.update(loaded, (revisions) => [...revisions, request.revision]).pipe(
            Effect.as({
              _tag: "Found" as const,
              definition: { agents: { assistant: original }, revision: "v1", services: oldServices },
            }),
          ),
      })
      yield* provideScoped(
        next,
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const session = yield* runtime.sessions.get("inbox")
          const beforeRetry = yield* Ref.get(fixture.creates)
          expect(yield* session.submit(replacement, "queued work", { commandId: "queued" })).toEqual(receipt)
          expect(yield* Ref.get(fixture.creates)).toBe(beforeRetry)
          yield* session.control("resume", "resume")
          const observed = yield* session.events().pipe(
            Stream.takeUntil((event) => event._tag === "RunChanged" && event.run.status === "succeeded"),
            Stream.runCollect,
            Effect.forkChild,
          )
          yield* TestClock.adjust("1 second")
          const changes = yield* Fiber.join(observed)
          expect(yield* Ref.get(loaded)).toContain("v1")
          const completed = changes.find((event) => event._tag === "RunChanged" && event.run.status === "succeeded")
          expect(completed).toMatchObject({
            _tag: "RunChanged",
            run: { agent: { name: "assistant", revision: "v1" }, status: "succeeded" },
          })
          const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Array(ClientEvent)))(changes)
          expect(encoded).not.toContain("executableManifest")
          expect(encoded).not.toContain("attemptFence")
          expect(encoded).not.toContain("registrations")
        }),
      )
    }),
  )
})
