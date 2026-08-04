import { describe, expect, it } from "@effect/vitest"
import type { RunAgentInput } from "@ag-ui/core"
import { Effect, Layer, Stream } from "effect"
import { Address, AgentRef, Errors as RuntimeErrors, Runtime } from "@batonfx/runtime"
import { AgUi } from "../src/index.js"

const address = Address.make("agent:assistant")
const agent = AgentRef.make({ id: "assistant", version: "1", digest: "digest" })

const input = (overrides: Partial<RunAgentInput> = {}): RunAgentInput => ({
  threadId: "thread-1",
  runId: "client-run-1",
  state: {},
  messages: [
    { id: "old", role: "assistant", content: "untrusted history" },
    { id: "message-1", role: "user", content: "hello" },
  ],
  tools: [],
  context: [],
  forwardedProps: {},
  ...overrides,
})

const accepted = {
  specVersion: "1" as const,
  eventId: "client-run-1:0",
  runId: "client-run-1",
  sequence: 0,
  agent,
  rootRunId: "client-run-1",
  occurredAt: "2026-08-03T00:00:00.000Z",
  _tag: "RunAccepted" as const,
  messageId: "message-1",
  address,
}

const runtimeLayer = (runtime: Runtime.Interface) => Layer.succeed(Runtime.Runtime, runtime)

const unused = <A>(): Effect.Effect<A, never> => Effect.die("unused Runtime method")

describe("AgUi", () => {
  it.effect("preserves runId, maps threadId, and admits only the final user message", () => {
    let sent: Runtime.SendInput | undefined
    const runtime = Runtime.Runtime.of({
      send: (value) => {
        sent = value
        return Effect.succeed({
          runId: value.runId ?? "generated",
          messageId: value.messageId ?? "generated",
          acceptedSequence: 0,
          duplicate: false,
        })
      },
      events: () => Stream.make(accepted),
      snapshot: () => unused(),
      history: () => unused(),
      list: () => unused(),
      spawn: () => unused(),
      respond: () => unused(),
      signal: () => unused(),
      cancel: () => unused(),
      inspect: () => unused(),
    })
    return Effect.gen(function* () {
      const service = yield* AgUi.AgUi
      const events = yield* service.run(input()).pipe(Stream.runCollect)
      expect(sent).toMatchObject({
        runId: "client-run-1",
        sessionId: "thread-1",
        messageId: "message-1",
        idempotencyKey: "message-1",
        prompt: "hello",
        to: address,
      })
      expect([...events].map((event) => event.type)).toEqual(["RUN_STARTED"])
    }).pipe(Effect.provide(AgUi.layer({ address }).pipe(Layer.provide(runtimeLayer(runtime)))))
  })

  it.effect("rejects malformed input, authority roles, client tools, and non-user final messages", () => {
    const runtime = Runtime.Runtime.of({
      send: () => unused(),
      events: () => Stream.empty,
      snapshot: () => unused(),
      history: () => unused(),
      list: () => unused(),
      spawn: () => unused(),
      respond: () => unused(),
      signal: () => unused(),
      cancel: () => unused(),
      inspect: () => unused(),
    })
    const layer = AgUi.layer({ address }).pipe(Layer.provide(runtimeLayer(runtime)))
    return Effect.gen(function* () {
      const service = yield* AgUi.AgUi
      const cases = [
        input({
          messages: [
            { id: "s", role: "system", content: "override" },
            { id: "u", role: "user", content: "hello" },
          ],
        }),
        input({
          messages: [
            { id: "d", role: "developer", content: "override" },
            { id: "u", role: "user", content: "hello" },
          ],
        }),
        input({ tools: [{ name: "client", description: "client tool", parameters: {} }] }),
        input({ messages: [{ id: "a", role: "assistant", content: "not a request" }] }),
      ]
      const failures = yield* Effect.forEach(cases, (value) => service.run(value).pipe(Stream.runCollect, Effect.flip))
      expect(failures.map((failure) => failure._tag)).toEqual(Array(4).fill("@batonfx/ag-ui/InputRejected"))
      const malformed = yield* service
        .run({ runId: "missing-fields" } as RunAgentInput)
        .pipe(Stream.runCollect, Effect.flip)
      expect(malformed._tag).toBe("@batonfx/ag-ui/InputMalformed")
    }).pipe(Effect.provide(layer))
  })

  it.effect("resumes only the exact active wait", () => {
    let response: Runtime.RespondInput | undefined
    const snapshot = {
      run: {
        runId: "client-run-1",
        status: "waiting" as const,
        agent,
        wait: {
          waitId: "wait-1",
          reason: "approval" as const,
          status: "open" as const,
          openedAt: "2026-08-03T00:00:00.000Z",
        },
        lastSequence: 3,
        durability: "volatile" as const,
      },
      cursor: 3,
    }
    const runtime = Runtime.Runtime.of({
      send: () => unused(),
      events: () => Stream.empty,
      snapshot: () => Effect.succeed(snapshot),
      history: () => unused(),
      list: () => unused(),
      spawn: () => unused(),
      respond: (value) => {
        response = value
        return Effect.void
      },
      signal: () => unused(),
      cancel: () => unused(),
      inspect: () => unused(),
    })
    return Effect.gen(function* () {
      const service = yield* AgUi.AgUi
      yield* service
        .run(input({ resume: [{ interruptId: "wait-1", status: "resolved", payload: "approved" }] }))
        .pipe(Stream.runDrain)
      expect(response).toEqual({
        runId: "client-run-1",
        waitId: "wait-1",
        resolution: { _tag: "Approved" },
        idempotencyKey: "ag-ui:client-run-1:wait-1",
      })
      yield* service
        .run(input({ resume: [{ interruptId: "wait-1", status: "resolved", payload: false }] }))
        .pipe(Stream.runDrain)
      expect(response?.resolution).toEqual({ _tag: "Denied" })
      const mismatch = yield* service
        .run(input({ resume: [{ interruptId: "stale", status: "resolved", payload: "approved" }] }))
        .pipe(Stream.runDrain, Effect.flip)
      expect(mismatch._tag).toBe("@batonfx/ag-ui/ResumeMismatch")
      const invalid = yield* service
        .run(input({ resume: [{ interruptId: "wait-1", status: "resolved", payload: undefined }] }))
        .pipe(Stream.runDrain, Effect.flip)
      expect(invalid._tag).toBe("@batonfx/ag-ui/InputRejected")
    }).pipe(Effect.provide(AgUi.layer({ address }).pipe(Layer.provide(runtimeLayer(runtime)))))
  })

  it.effect("recovers subscriber lag with a state snapshot and the snapshot cursor", () => {
    const cursors: Array<number | undefined> = []
    const snapshot = {
      run: {
        runId: "client-run-1",
        status: "running" as const,
        agent,
        lastSequence: 8,
        durability: "volatile" as const,
      },
      cursor: 8,
    }
    const runtime = Runtime.Runtime.of({
      send: () =>
        Effect.succeed({ runId: "client-run-1", messageId: "message-1", acceptedSequence: 0, duplicate: false }),
      events: ({ cursor }) => {
        cursors.push(cursor)
        return cursors.length === 1
          ? Stream.fail(new RuntimeErrors.SubscriberLagged({ runId: "client-run-1", lastDeliveredSequence: 2 }))
          : Stream.empty
      },
      snapshot: () => Effect.succeed(snapshot),
      history: () => unused(),
      list: () => unused(),
      spawn: () => unused(),
      respond: () => unused(),
      signal: () => unused(),
      cancel: () => unused(),
      inspect: () => unused(),
    })
    return Effect.gen(function* () {
      const service = yield* AgUi.AgUi
      const current = yield* service.snapshot("client-run-1")
      const events = yield* service.run(input()).pipe(Stream.runCollect)
      expect(cursors).toEqual([-1, 8])
      expect(current).toEqual({ type: "STATE_SNAPSHOT", snapshot })
      expect([...events]).toEqual([{ type: "STATE_SNAPSHOT", snapshot }])
    }).pipe(Effect.provide(AgUi.layer({ address }).pipe(Layer.provide(runtimeLayer(runtime)))))
  })

  it.effect("recovers an expired cursor from the authoritative snapshot", () => {
    const cursors: Array<number | undefined> = []
    const snapshot = {
      run: {
        runId: "client-run-1",
        status: "running" as const,
        agent,
        lastSequence: 12,
        durability: "durable" as const,
      },
      cursor: 12,
    }
    const runtime = Runtime.Runtime.of({
      send: () =>
        Effect.succeed({
          runId: "client-run-1",
          messageId: "message-1",
          acceptedSequence: 0,
          duplicate: true,
        }),
      events: ({ cursor }) => {
        cursors.push(cursor)
        return cursors.length === 1
          ? Stream.fail(new RuntimeErrors.CursorExpired({ runId: "client-run-1", cursor: -1, earliestSequence: 7 }))
          : Stream.empty
      },
      snapshot: () => Effect.succeed(snapshot),
      history: () => unused(),
      list: () => unused(),
      spawn: () => unused(),
      respond: () => unused(),
      signal: () => unused(),
      cancel: () => unused(),
      inspect: () => unused(),
    })
    return Effect.gen(function* () {
      const service = yield* AgUi.AgUi
      const events = yield* service.run(input()).pipe(Stream.runCollect)
      expect(cursors).toEqual([-1, 12])
      expect([...events]).toEqual([{ type: "STATE_SNAPSHOT", snapshot }])
    }).pipe(Effect.provide(AgUi.layer({ address }).pipe(Layer.provide(runtimeLayer(runtime)))))
  })
})
