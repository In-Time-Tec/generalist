import { Effect, Schema } from "effect"
import { SessionNotFound } from "../../../session/host.js"
import {
  PendingInput,
  SessionQueueConflict,
  type SubmitInput,
  type UpdateInput,
  type RemoveInput,
  type SessionSelection,
} from "../../../session/queue.js"
import { RuntimeUnavailable } from "../../../errors.js"
import { make as makeMessage } from "../../../messaging/message.js"
import { make as makeAddress } from "../../../address.js"
import { validate as validatePayload } from "../../../execution/payload/index.js"
import { decodePinned } from "../../../executable/manifest-internal.js"
import { laneKey, type RuntimeState } from "../../projection.js"
import { admitStart, addRegistrations } from "../admission/accept.js"
import { normalize as normalizeTreePolicy } from "../../../tree/policy.js"

const sessionFor = (state: RuntimeState, sessionId: string) => {
  const stored = state.hostSessions.get(sessionId)
  return stored === undefined ? Effect.fail(SessionNotFound.make({ sessionId })) : Effect.succeed(stored)
}

const validateSelection = (sessionId: string, selection: SessionSelection | undefined) =>
  Effect.gen(function* () {
    if (selection === undefined)
      return yield* SessionQueueConflict.make({
        sessionId,
        reason: "selection",
        hint: "Select a registered Agent before submitting input.",
      })
    yield* Effect.try({
      try: () => decodePinned({ ref: selection.executableRef, manifest: selection.executableManifest }),
      catch: () =>
        SessionQueueConflict.make({ sessionId, reason: "selection", hint: "Use a valid pinned Agent selection." }),
    })
    const active = selection.executableManifest.entries.find((entry) => entry.pin === selection.executableRef.active)
    if (active?._tag !== "Agent")
      return yield* SessionQueueConflict.make({
        sessionId,
        reason: "selection",
        hint: "Only Agent Runs occupy the conversational queue.",
      })
    yield* normalizeTreePolicy(selection.treePolicy).pipe(
      Effect.mapError(() =>
        SessionQueueConflict.make({ sessionId, reason: "selection", hint: "Use a valid bounded tree policy." }),
      ),
    )
    return selection
  })

const validateQueue = (sessionId: string, queue: ReadonlyArray<PendingInput>) =>
  Effect.gen(function* () {
    const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Array(PendingInput)))(queue).pipe(
      Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
    )
    if (queue.length > 64 || new TextEncoder().encode(encoded).byteLength > 1048576) {
      return yield* SessionQueueConflict.make({
        sessionId,
        reason: "capacity",
        hint: "The Session queue supports at most 64 entries and 1 MiB of encoded pending inputs and pinned settings. Remove or shorten pending input.",
      })
    }
  })

export const promote = ({ state, sessionId }: { readonly state: RuntimeState; readonly sessionId: string }) =>
  Effect.gen(function* () {
    const stored = state.hostSessions.get(sessionId)
    const pending = stored?.session.queue[0]
    if (
      stored === undefined ||
      pending === undefined ||
      stored.session.activeRunId !== undefined ||
      (state.lanes.get(laneKey(sessionId))?.queue.length ?? 0) > 0
    )
      return state
    const hostSessions = new Map(state.hostSessions)
    hostSessions.set(sessionId, { ...stored, session: { ...stored.session, queue: stored.session.queue.slice(1) } })
    const [receipt, admitted] = yield* admitStart(
      { ...state, hostSessions },
      {
        ...pending.selection,
        message: makeMessage({
          id: `session-input:${pending.id}`,
          to: makeAddress("runtime:session-input"),
          sessionId,
          idempotencyKey: `session-input:${pending.id}`,
          correlationId: pending.id,
          metadata: {},
          prompt: pending.prompt,
        }),
        initialChildren: [],
        initialFanOuts: [],
      },
    ).pipe(
      Effect.mapError((error) => RuntimeUnavailable.make({ message: `Session input promotion failed: ${error._tag}` })),
    )
    const sessions = new Map(admitted.hostSessions)
    const current = sessions.get(sessionId)
    if (current === undefined)
      return yield* RuntimeUnavailable.make({ message: "Session disappeared during admission" })
    sessions.set(sessionId, { ...current, session: { ...current.session, activeRunId: receipt.runId } })
    return { ...admitted, hostSessions: sessions }
  })

export const submit = ({ state, input }: { readonly state: RuntimeState; readonly input: SubmitInput }) =>
  Effect.gen(function* () {
    yield* validatePayload({ value: input, boundary: "Session input" })
    const stored = yield* sessionFor(state, input.sessionId)
    const selection = yield* validateSelection(input.sessionId, input.selection ?? stored.session.selection)
    const registrationCatalog = yield* addRegistrations({ state, registrations: selection.registrations }).pipe(
      Effect.mapError(() =>
        SessionQueueConflict.make({
          sessionId: input.sessionId,
          reason: "selection",
          hint: "A pinned registration already has different content.",
        }),
      ),
    )
    const item: PendingInput = { id: input.commandId, revision: 1, prompt: input.prompt, selection }
    const queue = [...stored.session.queue, item]
    yield* validateQueue(input.sessionId, queue)
    const hostSessions = new Map(state.hostSessions)
    hostSessions.set(input.sessionId, { ...stored, session: { ...stored.session, selection, queue } })
    const next = yield* promote({ state: { ...state, hostSessions, registrationCatalog }, sessionId: input.sessionId })
    return [{ id: item.id, revision: item.revision }, next] as const
  })

export const update = ({ state, input }: { readonly state: RuntimeState; readonly input: UpdateInput | RemoveInput }) =>
  Effect.gen(function* () {
    yield* validatePayload({ value: input, boundary: "Session queue mutation" })
    const stored = yield* sessionFor(state, input.sessionId)
    const item = stored.session.queue.find((entry) => entry.id === input.id)
    if (item === undefined || item.revision !== input.expectedRevision)
      return yield* SessionQueueConflict.make({
        sessionId: input.sessionId,
        reason: "revision",
        hint: "Reload the Session queue: the input was edited, removed, or claimed by its Run.",
      })
    const revision = item.revision + 1
    const replacement =
      "prompt" in input
        ? {
            ...item,
            revision,
            prompt: input.prompt,
            selection: yield* validateSelection(input.sessionId, input.selection ?? item.selection),
          }
        : undefined
    const registrationCatalog =
      replacement === undefined
        ? state.registrationCatalog
        : yield* addRegistrations({ state, registrations: replacement.selection.registrations }).pipe(
            Effect.mapError(() =>
              SessionQueueConflict.make({
                sessionId: input.sessionId,
                reason: "selection",
                hint: "A pinned registration already has different content.",
              }),
            ),
          )
    const queue = stored.session.queue.flatMap((entry) => {
      if (entry.id !== item.id) return [entry]
      return replacement === undefined ? [] : [replacement]
    })
    yield* validateQueue(input.sessionId, queue)
    const hostSessions = new Map(state.hostSessions)
    hostSessions.set(input.sessionId, { ...stored, session: { ...stored.session, queue } })
    return [
      { id: item.id, revision },
      { ...state, hostSessions, registrationCatalog },
    ] as const
  })
