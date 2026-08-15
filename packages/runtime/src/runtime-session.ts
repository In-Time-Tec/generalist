import { Effect, Option, Schema } from "effect"
import type { Session } from "@batonfx/core"
import { RuntimeUnavailable, SessionEntryCorrupt, SessionEntryNotFound } from "./errors.js"
import type { Interface as RunStoreInterface } from "./run-store.js"
import type { ModelResponseEvent, SessionEntryInput } from "./runtime.js"
import {
  completedSessionEntryId,
  hydrateCompletedOperation,
  referenceFromEvent,
  resolvedModelResponse,
} from "./model-response-commit.js"
import { interruptedSessionEntryId, resolveInterruptedModelResponse } from "./model-response-interrupted.js"

export const makeSessionEntry =
  (store: RunStoreInterface) =>
  (
    input: SessionEntryInput,
  ): Effect.Effect<Session.Entry, SessionEntryNotFound | SessionEntryCorrupt | RuntimeUnavailable> =>
    Effect.gen(function* () {
      const session = yield* store.sessionStore(input.sessionId)
      if (Option.isNone(session)) {
        return yield* RuntimeUnavailable.make({ message: `Session ${input.sessionId} is unavailable` })
      }
      const path = yield* session.value.path(input.entryId).pipe(
        Effect.mapError((error) =>
          error.message.includes("does not exist")
            ? SessionEntryNotFound.make(input)
            : SessionEntryCorrupt.make({ ...input, message: error.message }),
        ),
        Effect.catchDefect((defect) =>
          Effect.fail(
            SessionEntryCorrupt.make({
              ...input,
              message: `Session entry could not be decoded: ${String(defect)}`,
            }),
          ),
        ),
      )
      const entry = path.at(-1)
      if (entry?.id !== input.entryId) return yield* SessionEntryNotFound.make(input)
      return Object.freeze(entry)
    })

export const makeModelResponseResolver = (store: RunStoreInterface) => (event: ModelResponseEvent) =>
  Effect.gen(function* () {
    const expectedEntryId =
      event._tag === "ModelResponseCommitted"
        ? completedSessionEntryId({ runId: event.runId, operationKey: event.operationKey })
        : interruptedSessionEntryId({ runId: event.runId, operationKey: event.operationKey })
    if (event.sessionEntryId !== expectedEntryId) {
      return yield* SessionEntryCorrupt.make({
        sessionId: event.sessionId,
        entryId: event.sessionEntryId,
        message: "Session model response entry identity does not match its Run operation",
      })
    }
    const session = yield* store.sessionStore(event.sessionId)
    if (Option.isNone(session)) {
      return yield* RuntimeUnavailable.make({ message: `Session ${event.sessionId} is unavailable` })
    }
    if (event._tag === "ModelResponseCommitted") {
      const operation = yield* hydrateCompletedOperation({
        session: session.value,
        reference: referenceFromEvent(event),
      })
      return resolvedModelResponse(operation)
    }
    const entry = yield* makeSessionEntry(store)({ sessionId: event.sessionId, entryId: event.sessionEntryId })
    const response = resolveInterruptedModelResponse({ event, entry })
    if (Schema.is(SessionEntryCorrupt)(response)) return yield* response
    return response
  })
