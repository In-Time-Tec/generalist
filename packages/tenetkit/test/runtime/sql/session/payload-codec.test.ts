import { Database } from "bun:sqlite"
import { expect, it } from "@effect/vitest"
import { DateTime, Effect, Layer, Redacted, Schema, Scope, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import { Agent, Session } from "../../../../src/index.js"
import { Address, ExecutableResolver, RunExecutor, Runtime, RunStore } from "../../../../src/runtime/index.js"
import { decodeSessionPayload, encodeSessionPayload } from "../../../../src/runtime/sql/session/payload-codec.js"
import { SessionStorage } from "../../../../src/runtime/sql/session/store.js"
import { registrationsFor } from "../../execution/fixtures.js"
import { testExecutable } from "../../run/identity.js"
import { tempDbPath } from "../scenario.js"

import { Runtime as SqliteRuntime } from "../../../../src/runtime/sqlite-bun.js"
const usage = Response.Usage.make({
  inputTokens: { total: 1, uncached: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
})

const scopedWith =
  <A, E>(layer: Layer.Layer<A, E>) =>
  <B, E2, R extends A | Scope.Scope>(effect: Effect.Effect<B, E2, R>) =>
    Effect.scoped(Effect.flatMap(Layer.build(layer), (context) => effect.pipe(Effect.provideContext(context))))

it("restores redacted HTTP headers without changing unrelated empty objects", () => {
  const encoded = encodeSessionPayload({
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
  })

  expect(encoded).not.toContain("redaction-canary")
  expect(encoded).toContain('"authorization":{}')
  const decoded = decodeSessionPayload(encoded)
  if (decoded._tag !== "ModelResponse") throw new Error("expected ModelResponse")
  expect(decoded.content).toMatchObject([
    {
      type: "response-metadata",
      request: { headers: { authorization: "<redacted>", "x-safe": "safe" } },
      metadata: { provider: { authoredEmpty: {} } },
    },
    { type: "finish", response: { headers: { "set-cookie": "<redacted>", "x-safe": "safe" } } },
  ])
})

it("compares transformed Session payloads through their durable representation", () => {
  const finish = Response.makePart("finish", { reason: "stop", usage, response: undefined })
  const payload: Session.EntryPayload = {
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
  const reopened = decodeSessionPayload(encodeSessionPayload(payload))
  expect(SessionStorage.entryPayloadEquivalence(payload, reopened)).toBe(true)

  const reordered: Session.EntryPayload =
    reopened._tag === "ModelResponse"
      ? {
          ...reopened,
          content: reopened.content.map((part) =>
            part.type === "response-metadata" ? { ...part, metadata: { provider: { second: 2, first: 1 } } } : part,
          ),
        }
      : reopened
  expect(SessionStorage.entryPayloadEquivalence(payload, reordered)).toBe(true)

  const changed: Session.EntryPayload = {
    ...payload,
    content: [
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
  expect(SessionStorage.entryPayloadEquivalence(payload, changed)).toBe(false)

  const authoredMap = Schema.decodeSync(Session.EntryPayload)({
    _tag: "Memory",
    items: ["value"],
    metadata: { value: new Map([["key", "value"]]) },
  })
  const authoredEmpty = Schema.decodeSync(Session.EntryPayload)({
    _tag: "Memory",
    items: ["value"],
    metadata: { value: {} },
  })
  const authoredMapLookalike = Schema.decodeSync(Session.EntryPayload)({
    _tag: "Memory",
    items: ["value"],
    metadata: { value: { $map: [["key", "value"]] } },
  })
  const authoredUndefined = Schema.decodeSync(Session.EntryPayload)({
    _tag: "Memory",
    items: ["value"],
    metadata: { value: undefined },
  })
  const authoredUndefinedLookalike = Schema.decodeSync(Session.EntryPayload)({
    _tag: "Memory",
    items: ["value"],
    metadata: { value: { $undefined: "" } },
  })
  expect(SessionStorage.entryPayloadEquivalence(authoredMap, authoredEmpty)).toBe(false)
  expect(SessionStorage.entryPayloadEquivalence(authoredMap, authoredMapLookalike)).toBe(false)
  const shared = { nested: true }
  const aliased = Schema.decodeSync(Session.EntryPayload)({
    _tag: "Memory",
    items: ["value"],
    metadata: { first: shared, second: shared },
  })
  expect(SessionStorage.entryPayloadEquivalence(aliased, decodeSessionPayload(encodeSessionPayload(aliased)))).toBe(
    true,
  )
  expect(SessionStorage.entryPayloadEquivalence(authoredUndefined, authoredUndefinedLookalike)).toBe(false)
})

it.effect("reopens and hydrates a model response without persisting provider transport secrets", () => {
  const filename = tempDbPath("model-response-redaction")
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
  const resolver = ExecutableResolver.makeStatic([{ executable, agent: Agent.close(agent, model) }])
  const options = {
    filename,
    resolver,
    addresses: [{ address, executable, registrations: registrationsFor(executable) }],
    scheduler: { pollInterval: "1 day" as const },
  }

  return Effect.gen(function* () {
    const runId = yield* scopedWith(SqliteRuntime.layerSqlite(options))(
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
        const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "model-response-redaction" })
        yield* host.execute(claim)
        expect((yield* runtime.snapshot(receipt.runId)).run.status).toBe("succeeded")
        return receipt.runId
      }),
    )

    yield* scopedWith(SqliteRuntime.layerSqlite(options))(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const event = (yield* runtime.history({ runId, limit: 100 })).find(
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
      }),
    )

    const database = new Database(filename, { readonly: true })
    const payloads = database
      .query<
        { payload_json: string },
        []
      >("SELECT payload_json FROM tenetkit_session_entries WHERE tag = 'ModelResponse'")
      .all()
    const modelOperations = database
      .query<{ result_json: string | null }, []>("SELECT result_json FROM tenetkit_run_operations WHERE kind = 'model'")
      .all()
    const committedEvents = database
      .query<
        { event_json: string },
        []
      >("SELECT event_json FROM tenetkit_run_events WHERE event_json LIKE '%ModelResponseCommitted%'")
      .all()
    database.close()
    expect(payloads).toHaveLength(1)
    expect(payloads[0]?.payload_json).toContain("safe answer")
    expect(payloads[0]?.payload_json).not.toContain("persistence-canary")
    expect(payloads[0]?.payload_json).not.toContain("authorization")
    expect(payloads[0]?.payload_json).not.toContain("set-cookie")
    expect(modelOperations).toHaveLength(1)
    expect(modelOperations[0]?.result_json).not.toContain("persistence-canary")
    expect(committedEvents).toHaveLength(1)
    expect(committedEvents[0]?.event_json).not.toContain("persistence-canary")
    expect(modelCalls).toBe(1)
  })
})
