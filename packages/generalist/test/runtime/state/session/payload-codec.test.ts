import { expect, it } from "@effect/vitest"
import { DateTime, Effect, Layer, Option, Redacted, Schema, Scope, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import { Agent, Session } from "../../../../src/index.js"
import type { Simulator } from "../../../../src/testing/durability/index.js"
import { Address, ExecutableResolver, RunExecutor, Runtime, RunStore } from "../../../../src/runtime/index.js"
import {
  assistantAddress,
  assistantRef,
  registrationsFor,
  resolverLayer,
} from "../../execution/fixtures.js"
import { makeObjectStorage, objectRuntimeLayer, objectWorkerId } from "../../execution/object.js"
import { testExecutable } from "../../run/identity.js"
import { allowAllAuthorization } from "../../../authorization.js"

const usage = Response.Usage.make({
  inputTokens: { total: 1, uncached: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
})

const scopedWith =
  <A, E>(layer: Layer.Layer<A, E>) =>
  <B, E2, R extends A | Scope.Scope>(effect: Effect.Effect<B, E2, R>) =>
    Effect.scoped(Effect.flatMap(Layer.build(layer), (context) => effect.pipe(Effect.provideContext(context))))

const objectLayer = (storage: Simulator) =>
  objectRuntimeLayer(
    {
      addresses: [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
      scheduler: { pollInterval: "1 day" as const },
    },
    storage,
  ).pipe(Layer.provide(resolverLayer))

const withObject = <A, E>(storage: Simulator, effect: Effect.Effect<A, E>): Effect.Effect<A, E> =>
  scopedWith(objectLayer(storage))(effect)

it.effect("reopens a Session entry with redacted provider headers and authored empty objects", () => {
  const storage = makeObjectStorage()
  const sessionId = "session:payload-redaction"
  const payload: Session.AppendInput = {
    _tag: "ModelResponse",
    content: [
      Response.makePart("response-metadata", {
        id: "redacted-response",
        modelId: "redacted-model",
        timestamp: undefined,
        request: {
          method: "POST",
          url: "https://provider.invalid/model",
          urlParams: [],
          hash: undefined,
          headers: { authorization: Redacted.make("Bearer redaction-canary"), "x-safe": "safe" },
        },
        metadata: { provider: { authoredEmpty: {} } },
      }),
      Response.makePart("finish", {
        reason: "stop",
        usage,
        response: {
          status: 200,
          headers: { "set-cookie": Redacted.make("session=redaction-canary"), "x-safe": "safe" },
        },
      }),
    ],
  }

  return Effect.gen(function* () {
    yield* withObject(
      storage,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const runStore = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId,
          idempotencyKey: "payload-redaction",
          prompt: "persist redaction",
        })
        const claim = yield* runStore.claimExecution({
          commandId: "runtime-state-session-payload-test-claim-1",
          runId: receipt.runId,
          ownerId: objectWorkerId,
        })
        const writer = Option.getOrThrow(yield* runStore.claimedSessionStore(claim))
        yield* writer.append(payload, { commandId: "payload-redaction-entry" })
      }),
    )

    yield* withObject(
      storage,
      Effect.gen(function* () {
        const reader = Option.getOrThrow(yield* (yield* RunStore.RunStore).sessionReader(sessionId))
        const [entry] = yield* reader.path()
        expect(entry?._tag).toBe("ModelResponse")
        if (entry?._tag !== "ModelResponse") return
        const metadata = entry.content.find((part) => part.type === "response-metadata")
        const finish = entry.content.find((part) => part.type === "finish")
        expect(metadata).toMatchObject({
          type: "response-metadata",
          request: undefined,
          metadata: { provider: { authoredEmpty: {} } },
        })
        expect(finish).toMatchObject({
          type: "finish",
          response: undefined,
        })
        expect(JSON.stringify(entry)).not.toContain("redaction-canary")
      }),
    )
  })
})

it.effect("reuses equivalent durable payloads and rejects changed Session identities", () => {
  const storage = makeObjectStorage()
  const sessionId = "session:payload-equivalence"
  const finish = Response.makePart("finish", { reason: "stop", usage, response: undefined })
  const payload: Session.AppendInput = {
    _tag: "ModelResponse",
    content: [
      Response.makePart("tool-call", {
        id: "tool-call-equivalence",
        name: "equivalent_tool",
        params: {},
        providerExecuted: false,
      }),
      Response.makePart("response-metadata", {
        id: "response-equivalence",
        modelId: "model-equivalence",
        timestamp: DateTime.makeUnsafe("2026-08-15T05:48:09.000Z"),
        request: undefined,
        metadata: { provider: { first: 1, second: 2 } },
      }),
      finish,
    ],
  }
  const reordered: Session.AppendInput = {
    _tag: "ModelResponse",
    content: [
      Response.makePart("tool-call", {
        id: "tool-call-equivalence",
        name: "equivalent_tool",
        params: {},
        providerExecuted: false,
      }),
      Response.makePart("response-metadata", {
        id: "response-equivalence",
        modelId: "model-equivalence",
        timestamp: DateTime.makeUnsafe("2026-08-15T05:48:09.000Z"),
        request: undefined,
        metadata: { provider: { second: 2, first: 1 } },
      }),
      finish,
    ],
  }
  const changed: Session.AppendInput = {
    ...reordered,
    content: [
      Response.makePart("tool-call", {
        id: "tool-call-equivalence",
        name: "equivalent_tool",
        params: {},
        providerExecuted: false,
      }),
      Response.makePart("response-metadata", {
        id: "response-equivalence",
        modelId: "model-equivalence",
        timestamp: DateTime.makeUnsafe("2026-08-15T05:48:10.000Z"),
        request: undefined,
        metadata: { provider: { first: 1, second: 2 } },
      }),
      finish,
    ],
  }
  const mapPayload: Session.AppendInput = {
    _tag: "Memory",
    items: ["value"],
    metadata: { value: new Map([["key", "value"]]) },
  }
  const emptyPayload: Session.AppendInput = {
    _tag: "Memory",
    items: ["value"],
    metadata: { value: {} },
  }
  const undefinedPayload: Session.AppendInput = {
    _tag: "Memory",
    items: ["value"],
    metadata: { value: undefined },
  }
  const undefinedLookalike: Session.AppendInput = {
    _tag: "Memory",
    items: ["value"],
    metadata: { value: { $undefined: "" } },
  }
  const shared = { nested: true }
  const aliased: Session.AppendInput = {
    _tag: "Memory",
    items: ["value"],
    metadata: { first: shared, second: shared },
  }

  return Effect.gen(function* () {
    yield* withObject(
      storage,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const runStore = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId,
          idempotencyKey: "payload-equivalence",
          prompt: "persist equivalent payloads",
        })
        const claim = yield* runStore.claimExecution({
          commandId: "runtime-state-session-payload-test-claim-2",
          runId: receipt.runId,
          ownerId: objectWorkerId,
        })
        const writer = Option.getOrThrow(yield* runStore.claimedSessionStore(claim))
        const first = yield* writer.append(payload, { id: "equivalence-entry", expectedLeafId: null })
        const map = yield* writer.append(mapPayload, { id: "map-entry", expectedLeafId: first.id })
        const undefinedEntry = yield* writer.append(undefinedPayload, {
          id: "undefined-entry",
          expectedLeafId: map.id,
        })
        yield* writer.append(aliased, { id: "aliased-entry", expectedLeafId: undefinedEntry.id })
      }),
    )

    yield* withObject(
      storage,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const runStore = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId,
          idempotencyKey: "payload-equivalence",
          prompt: "persist equivalent payloads",
        })
        const claim = yield* runStore.claimExecution({
          commandId: "runtime-state-session-payload-test-claim-3",
          runId: receipt.runId,
          ownerId: objectWorkerId,
        })
        const writer = Option.getOrThrow(yield* runStore.claimedSessionStore(claim))
        const reader = Option.getOrThrow(yield* runStore.sessionReader(sessionId))
        const path = yield* reader.path()
        const persisted = path.find((entry) => entry.id === "equivalence-entry")
        expect(persisted?._tag).toBe("ModelResponse")
        expect(yield* writer.append(payload, { id: "equivalence-entry", expectedLeafId: null })).toEqual(persisted)
        expect(yield* writer.append(reordered, { id: "equivalence-entry", expectedLeafId: null })).toEqual(persisted)

        const changedResult = yield* Effect.flip(
          writer.append(changed, { id: "equivalence-entry", expectedLeafId: null }),
        )
        expect(changedResult).toMatchObject({
          _tag: "generalist/core/SessionConflict",
          reason: "entry-id-reused",
        })

        const mapResult = yield* Effect.flip(
          writer.append(emptyPayload, { id: "map-entry", expectedLeafId: "equivalence-entry" }),
        )
        expect(mapResult).toMatchObject({
          _tag: "generalist/core/SessionConflict",
          reason: "entry-id-reused",
        })
        const undefinedResult = yield* Effect.flip(
          writer.append(undefinedLookalike, { id: "undefined-entry", expectedLeafId: "map-entry" }),
        )
        expect(undefinedResult).toMatchObject({
          _tag: "generalist/core/SessionConflict",
          reason: "entry-id-reused",
        })

        const storedMap = path.find((entry) => entry.id === "map-entry")
        expect(storedMap?.metadata?.value).toEqual(new Map([["key", "value"]]))
        const storedUndefined = path.find((entry) => entry.id === "undefined-entry")
        expect(storedUndefined?.metadata).toEqual({ value: undefined })
        const storedAlias = path.find((entry) => entry.id === "aliased-entry")
        expect(storedAlias?.metadata).toEqual({ first: { nested: true }, second: { nested: true } })
      }),
    )
  })
})

it.effect("reopens and hydrates a model response without persisting provider transport secrets", () => {
  const storage = makeObjectStorage()
  const agent = Agent.make({ name: "model-response-redaction" })
  const executable = testExecutable(agent, "model-response-redaction")
  const address = Address.make("agent:model-response-redaction")
  let modelCalls = 0
  const responseTimestamp = DateTime.makeUnsafe("2026-08-15T05:48:09.000Z")
  const model = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.die("unexpected generateText"),
      streamText: () => {
        modelCalls += 1
        return Stream.fromIterable<Response.StreamPartEncoded>([
          Schema.encodeSync(Response.ResponseMetadataPart)(
            Response.makePart("response-metadata", {
              id: "response-redaction",
              modelId: "model-redaction",
              timestamp: responseTimestamp,
              request: {
                method: "POST",
                url: "https://provider.invalid/model",
                urlParams: [],
                hash: undefined,
                headers: {
                  authorization: Redacted.make("Bearer persistence-canary"),
                  "x-safe-request": "safe-request",
                },
              },
            }),
          ),
          Response.makePart("text-delta", { id: "answer", delta: "safe answer" }),
          Schema.encodeSync(Response.FinishPart)(
            Response.makePart("finish", {
              reason: "stop",
              usage,
              response: {
                status: 200,
                headers: {
                  "set-cookie": Redacted.make("session=persistence-canary"),
                  "x-safe-response": "safe-response",
                },
              },
            }),
          ),
        ])
      },
    }),
  )
  const options = {
    addresses: [{ address, executable, registrations: registrationsFor(executable) }],
    scheduler: { pollInterval: "1 day" as const },
  }

  return Effect.gen(function* () {
    const runtimeLayer = objectRuntimeLayer(options, storage).pipe(
      Layer.provide(
        ExecutableResolver.layerStatic([
          { executable, agent: Agent.close(agent, Layer.mergeAll(allowAllAuthorization, model)) },
        ]).pipe(Layer.orDie),
      ),
    )
    const runId = yield* scopedWith(runtimeLayer)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: address,
          sessionId: "session:model-response-redaction",
          idempotencyKey: "model-response-redaction",
          prompt: "answer safely",
        })
        const claim = yield* store.claimExecution({
          commandId: "runtime-state-session-payload-codec-test-claim-1",
          runId: receipt.runId,
          ownerId: objectWorkerId,
        })
        yield* host.execute(claim)
        expect((yield* runtime.snapshot(receipt.runId)).run.status).toBe("succeeded")
        expect(modelCalls).toBe(1)
        return receipt.runId
      }),
    )

    yield* scopedWith(runtimeLayer)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const event = (yield* runtime.history({ runId, cursor: -1, limit: 100 })).find(
          (candidate) => candidate._tag === "ModelResponseCommitted",
        )
        if (event?._tag !== "ModelResponseCommitted") return yield* Effect.die("expected committed model response")
        const entry = yield* runtime.sessionEntry({ sessionId: event.sessionId, entryId: event.sessionEntryId })
        const response = yield* runtime.resolveModelResponse(event)
        expect(entry).toMatchObject({ _tag: "ModelResponse", id: event.sessionEntryId })
        expect(response.content).toEqual([
          Response.makePart("response-metadata", {
            id: "response-redaction",
            modelId: "model-redaction",
            timestamp: responseTimestamp,
            request: undefined,
          }),
          Response.makePart("text", { text: "safe answer" }),
          Response.makePart("finish", { reason: "stop", usage, response: undefined }),
        ])
        expect(response.finishReason).toBe("stop")
        expect(JSON.stringify(entry)).toContain("safe answer")
        expect(JSON.stringify(entry)).not.toContain("persistence-canary")
        expect(JSON.stringify(entry)).not.toContain("authorization")
        expect(JSON.stringify(entry)).not.toContain("set-cookie")
        const reader = Option.getOrThrow(yield* store.sessionReader(event.sessionId))
        expect((yield* reader.path()).some((candidate) => candidate.id === entry.id)).toBe(true)
      }),
    )
  })
})
