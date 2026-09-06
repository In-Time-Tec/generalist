import { Effect, Option, Schema } from "effect"
import type { Entry } from "../../core/context/session.js"
import { RuntimeUnavailable, SessionEntryCorrupt, SessionEntryNotFound } from "../errors.js"
import type { Service as RunStoreService } from "../run/store.js"
import type { ModelResponseEvent, SessionEntryInput } from "../service.js"
import {
  completedSessionEntryId,
  referenceFromEvent,
  resolvedModelResponse,
} from "../execution/model-response/commit.js"
import { hydrateCompletedOperation } from "../execution/model-response/hydration.js"
import { interruptedSessionEntryId, resolveInterruptedModelResponse } from "../execution/model-response/interrupted.js"

export const readEntry =
  (store: RunStoreService) =>
  (input: SessionEntryInput): Effect.Effect<Entry, SessionEntryNotFound | SessionEntryCorrupt | RuntimeUnavailable> =>
    Effect.gen(function* () {
      const session = yield* store.sessionReader(input.sessionId)
      if (Option.isNone(session)) {
        return yield* RuntimeUnavailable.make({ message: `Session ${input.sessionId} is unavailable` })
      }
      const entry = yield* session.value.entry(input.entryId).pipe(
        Effect.mapError((error) => SessionEntryCorrupt.make({ ...input, message: error.message })),
        Effect.catchDefect((defect) =>
          Effect.fail(
            SessionEntryCorrupt.make({
              ...input,
              message: `Session entry could not be decoded: ${String(defect)}`,
            }),
          ),
        ),
      )
      if (entry === undefined) return yield* SessionEntryNotFound.make(input)
      return Object.freeze(entry)
    })

export const resolveModelResponse = (store: RunStoreService) => (event: ModelResponseEvent) =>
  Effect.gen(function* () {
    const originPrefix = `${event.originRunId}:`
    const expectedOperationKey = event.originOperationKey.startsWith(originPrefix)
      ? `${event.runId}:${event.originOperationKey.slice(originPrefix.length)}`
      : event.originOperationKey
    if (event.operationKey !== expectedOperationKey) {
      return yield* SessionEntryCorrupt.make({
        sessionId: event.sessionId,
        entryId: event.sessionEntryId,
        message: "Session model response operation placement does not match its authored identity",
      })
    }
    const expectedEntryId =
      event._tag === "ModelResponseCommitted"
        ? completedSessionEntryId({ runId: event.originRunId, operationKey: event.originOperationKey })
        : interruptedSessionEntryId({ runId: event.originRunId, operationKey: event.originOperationKey })
    if (event.sessionEntryId !== expectedEntryId) {
      return yield* SessionEntryCorrupt.make({
        sessionId: event.sessionId,
        entryId: event.sessionEntryId,
        message: "Session model response entry identity does not match its Run operation",
      })
    }
    const session = yield* store.sessionReader(event.sessionId)
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
    const entry = yield* readEntry(store)({ sessionId: event.sessionId, entryId: event.sessionEntryId })
    const response = resolveInterruptedModelResponse({ event, entry })
    if (Schema.is(SessionEntryCorrupt)(response)) return yield* response
    return response
  })
