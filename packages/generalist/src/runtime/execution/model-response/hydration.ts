import { Effect, Schema } from "effect"
import { ModelResponseContent } from "../../../core/context/session.js"
import { RuntimeUnavailable, SessionEntryCorrupt, SessionEntryNotFound } from "../../errors.js"
import type { SessionReader } from "../../run/store.js"
import { operationFromReference, type CompletedOperation, type CompletedOperationRef } from "./commit.js"

export const hydrateCompletedOperation = (input: {
  readonly session: SessionReader
  readonly reference: CompletedOperationRef
}): Effect.Effect<CompletedOperation, SessionEntryNotFound | SessionEntryCorrupt> =>
  Effect.gen(function* () {
    const entry = yield* input.session.entry(input.reference.sessionEntryId).pipe(
      Effect.mapError((error) =>
        SessionEntryCorrupt.make({
          sessionId: input.reference.sessionId,
          entryId: input.reference.sessionEntryId,
          message: error.message,
        }),
      ),
      Effect.catchDefect((defect) =>
        Effect.fail(
          SessionEntryCorrupt.make({
            sessionId: input.reference.sessionId,
            entryId: input.reference.sessionEntryId,
            message: `Session entry could not be decoded: ${String(defect)}`,
          }),
        ),
      ),
    )
    if (entry === undefined) {
      return yield* SessionEntryNotFound.make({
        sessionId: input.reference.sessionId,
        entryId: input.reference.sessionEntryId,
      })
    }
    if (
      entry._tag !== "ModelResponse" ||
      entry.parentId !== input.reference.sessionParentId ||
      entry.metadata?.modelResponseDigest !== input.reference.digest
    ) {
      return yield* SessionEntryCorrupt.make({
        sessionId: input.reference.sessionId,
        entryId: input.reference.sessionEntryId,
        message: "Session model response reference does not match its entry",
      })
    }
    const content = yield* Schema.encodeEffect(ModelResponseContent)(entry.content).pipe(
      Effect.mapError((error) =>
        SessionEntryCorrupt.make({
          sessionId: input.reference.sessionId,
          entryId: input.reference.sessionEntryId,
          message: `Session model response content is corrupt: ${String(error)}`,
        }),
      ),
    )
    const operation = operationFromReference({ reference: input.reference, content })
    if (Schema.is(RuntimeUnavailable)(operation)) {
      return yield* SessionEntryCorrupt.make({
        sessionId: input.reference.sessionId,
        entryId: input.reference.sessionEntryId,
        message: operation.message,
      })
    }
    return operation
  })
