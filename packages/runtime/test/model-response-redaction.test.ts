import { Database } from "bun:sqlite"
import { expect, it } from "@effect/vitest"
import { Effect, Layer, Redacted, Schema, Scope, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import { Agent, Session } from "@batonfx/core"
import { Address, ExecutableResolver, ExecutionHost, Runtime, RunStore } from "../src/index.js"
import { decodeSessionPayload, encodeSessionPayload } from "../src/sql/session-payload-codec.js"
import { registrationsFor } from "./helpers.js"
import { testExecutable } from "./identity.js"
import { tempDbPath } from "./sqlite-helpers.js"

const usage = Response.Usage.make({
  inputTokens: { total: 1, uncached: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
})

const scopedWith =
  <A, E>(layer: Layer.Layer<A, E>) =>
  <B, E2, R extends A | Scope.Scope>(effect: Effect.Effect<B, E2, R>) =>
    Effect.scoped(Effect.flatMap(Layer.build(layer), (context) => effect.pipe(Effect.provideContext(context))))

it("repairs v0.26 redacted HTTP headers without changing unrelated empty objects", () => {
  const encoded = encodeSessionPayload({
    _tag: "ModelResponse",
    content: [
      Response.makePart("response-metadata", {
        id: "legacy-response",
        modelId: "legacy-model",
        timestamp: undefined,
        request: {
          method: "POST",
          url: "https://provider.invalid/model",
          urlParams: [],
          hash: undefined,
          headers: { authorization: Redacted.make("Bearer legacy-canary"), "x-safe": "safe" },
        },
        metadata: { provider: { authoredEmpty: {} } },
      }),
      Response.makePart("finish", {
        reason: "stop",
        usage,
        response: {
          status: 200,
          headers: { "set-cookie": Redacted.make("session=legacy-canary"), "x-safe": "safe" },
        },
      }),
    ],
  } as Session.EntryPayload)

  expect(encoded).not.toContain("legacy-canary")
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

it.effect("reopens and hydrates a model response without persisting provider transport secrets", () => {
  const filename = tempDbPath("model-response-redaction")
  const agent = Agent.make({ name: "model-response-redaction" })
  const executable = testExecutable(agent, "model-response-redaction")
  const address = Address.make("agent:model-response-redaction")
  let modelCalls = 0
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
              timestamp: undefined,
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
    const runId = yield* scopedWith(Runtime.layerSqlite(options))(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* ExecutionHost.ExecutionHost
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

    yield* scopedWith(Runtime.layerSqlite(options))(
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
            timestamp: undefined,
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
      .query<{ payload_json: string }, []>("SELECT payload_json FROM baton_session_entries WHERE tag = 'ModelResponse'")
      .all()
    const modelOperations = database
      .query<{ result_json: string | null }, []>("SELECT result_json FROM baton_run_operations WHERE kind = 'model'")
      .all()
    const committedEvents = database
      .query<
        { event_json: string },
        []
      >("SELECT event_json FROM baton_run_events WHERE event_json LIKE '%ModelResponseCommitted%'")
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
