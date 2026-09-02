import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { ToolContext } from "../../../../src/index.js"
import { Errors, Messaging } from "../../../../src/runtime/index.js"
import { textPrompt } from "../../execution/fixtures.js"
import { provideScoped } from "../../execution/scoped-provide.js"
import { messagingBackend, type MessagingBackend } from "../scenario.js"

const toolContext = (sessionId: string, runId: string) =>
  ToolContext.layerTest({
    signal: new AbortController().signal,
    emit: () => Effect.succeed(true),
    sessionId,
    runId,
    toolCallId: "call:send",
  })

const inExecution =
  (sessionId: string, runId: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    provideScoped(Layer.mergeAll(toolContext(sessionId, runId)), effect).pipe(Effect.scoped)

export const messagingSendOperationSuite = <StoreError, Extra = never>(
  backend: MessagingBackend<StoreError, Extra>,
) => {
  const { provide, familyFor, strangerFor } = messagingBackend(backend)
  const describeBackend = backend.skip === true ? describe.skip : describe
  const session = (label: string) => `thread:send-operation:${backend.name}:${label}`
  const provided = provide()

  describeBackend(`unified addressed admission (${backend.name})`, () => {
    it.live("journals one Inbox event and returns its receipt", () =>
      Effect.gen(function* () {
        const sessionId = session("journal")
        const { runtime, store, parent, first } = yield* familyFor(sessionId)
        const messaging = Messaging.make({
          store,
          policy: Messaging.Policy.make(),
          sendMessage: (request) => runtime.sendMessage(request),
        })

        const receipt = yield* messaging
          .send({ to: first.address, idempotencyKey: "durable-send", prompt: textPrompt("hello") })
          .pipe(inExecution(sessionId, parent.runId))

        expect(receipt.duplicate).toBe(false)
        const history = yield* runtime.history({ runId: first.runId, limit: 100 })
        expect(history.filter((event) => event._tag === "Inbox")).toHaveLength(1)
        expect((yield* runtime.messages({ runId: first.runId, limit: 10 })).map((entry) => entry.messageId)).toEqual([
          receipt.messageId,
        ])
      }).pipe(provided),
    )

    it.live("deduplicates a retry in the same journaled inbox", () =>
      Effect.gen(function* () {
        const sessionId = session("replay")
        const { runtime, store, parent, first } = yield* familyFor(sessionId)
        const messaging = Messaging.make({
          store,
          policy: Messaging.Policy.make(),
          sendMessage: (request) => runtime.sendMessage(request),
        })
        const send = messaging
          .send({ to: first.address, idempotencyKey: "replayed", prompt: textPrompt("hello") })
          .pipe(inExecution(sessionId, parent.runId))

        const original = yield* send
        const replayed = yield* send

        expect(replayed.duplicate).toBe(true)
        expect(replayed.entryId).toBe(original.entryId)
        expect(
          (yield* runtime.history({ runId: first.runId, limit: 100 })).filter((event) => event._tag === "Inbox"),
        ).toHaveLength(1)
      }).pipe(provided),
    )

    it.live("rejects a stranger before admission", () =>
      Effect.gen(function* () {
        const sessionId = session("unauthorized")
        const { runtime, store, parent } = yield* familyFor(sessionId)
        const outsider = yield* strangerFor(session("outsider"))
        const messaging = Messaging.make({
          store,
          policy: Messaging.Policy.make(),
          sendMessage: (request) => runtime.sendMessage(request),
        })

        const error = yield* messaging
          .send({ to: outsider.address, idempotencyKey: "denied", prompt: textPrompt("hello") })
          .pipe(inExecution(sessionId, parent.runId), Effect.flip)

        expect(error).toBeInstanceOf(Errors.NotInFamily)
        expect(yield* runtime.messages({ runId: outsider.runId, limit: 10 })).toEqual([])
      }).pipe(provided),
    )

    it.live("reads the unified inbox under the running Run's identity", () =>
      Effect.gen(function* () {
        const sessionId = session("in-execution-reads")
        const { runtime, store, parent, first, second } = yield* familyFor(sessionId)
        const messaging = Messaging.make({
          store,
          policy: Messaging.Policy.make(),
          sendMessage: (request) => runtime.sendMessage(request),
        })

        yield* runtime.sendMessage({
          fromRunId: first.runId,
          to: parent.address,
          idempotencyKey: "for-parent",
          prompt: textPrompt("status"),
        })

        const inbox = yield* messaging.inbox({ limit: 10 }).pipe(inExecution(sessionId, parent.runId))
        expect(inbox.flatMap((entry) => ("runId" in entry.from ? [entry.from.runId] : []))).toEqual([first.runId])

        const reachable = yield* messaging.directory.pipe(inExecution(sessionId, parent.runId))
        expect(new Set(reachable.map((entry) => entry.runId))).toEqual(new Set([first.runId, second.runId]))
      }).pipe(provided),
    )
  })
}
