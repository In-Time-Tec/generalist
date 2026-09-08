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
import { decodePinned, resolveChild } from "../../../executable/manifest-internal.js"
import { laneKey, type RuntimeState } from "../../projection.js"
import { admitStart, admitSpawn } from "../admission/accept.js"
import { addRegistrations } from "../admission/registration.js"
import { narrow as narrowTreePolicy } from "../../../tree/policy.js"
import { rootGrant, retainedBudget } from "../admission/policy.js"
import { narrowGrant, firstExhausted, capGrant } from "../../../budget/state.js"
import { isTerminal } from "../../../run.js"
import { digest } from "../../../run/steering.js"
import { admitSteering } from "../steering.js"
import type { MessageInput } from "../../../session/message.js"
import { deliveryPrompt } from "../../../messaging/mailbox.js"
import { runAddress, sessionAddress } from "../../../execution/agent/directory.js"

const sessionFor = (state: RuntimeState, sessionId: string) => {
  const stored = state.hostSessions.get(sessionId)
  return stored === undefined ? Effect.fail(SessionNotFound.make({ sessionId })) : Effect.succeed(stored)
}

const rejectClosed = (sessionId: string) =>
  SessionQueueConflict.make({
    sessionId,
    reason: "closed",
    hint: "A closed Session is read-only; use a new Session for additional work.",
  })

export const validateSelection = ({
  state,
  sessionId,
  selection,
  ceiling,
}: {
  readonly state: RuntimeState
  readonly sessionId: string
  readonly selection: SessionSelection | undefined
  readonly ceiling?: SessionSelection | undefined
}) =>
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
    const grant = yield* rootGrant({
      state,
      sessionId,
      selection,
    }).pipe(
      Effect.mapError(() =>
        SessionQueueConflict.make({ sessionId, reason: "selection", hint: "Use a valid bounded tree policy." }),
      ),
    )
    const treePolicy = yield* narrowTreePolicy({ policy: grant.treePolicy, ceiling: ceiling?.treePolicy ?? null }).pipe(
      Effect.mapError(() =>
        SessionQueueConflict.make({
          sessionId,
          reason: "selection",
          hint: "Queue edits may narrow, never widen, their admitted limits.",
        }),
      ),
    )
    const budget = narrowGrant(ceiling?.budget ?? grant.budget, grant.budget)
    if (budget === undefined)
      return yield* SessionQueueConflict.make({
        sessionId,
        reason: "selection",
        hint: "Queue edits may not widen their admitted spending grant.",
      })
    return { ...selection, treePolicy, budget }
  })

const validateQueue = (state: RuntimeState, sessionId: string, queue: ReadonlyArray<PendingInput>) =>
  Effect.gen(function* () {
    const session = state.hostSessions.get(sessionId)?.session
    const active = session?.activeRunId === undefined ? undefined : state.runs.get(session.activeRunId)
    const retained = [
      ...queue,
      ...(active?.steering ?? []).flatMap(
        (entry): ReadonlyArray<PendingInput> =>
          entry.sessionCommandId === undefined ||
          entry.consumedOperationId !== undefined ||
          session?.selection === undefined
            ? []
            : [
                {
                  id: entry.sessionCommandId,
                  revision: 1,
                  prompt: entry.prompt,
                  from: entry.from,
                  selection: session.selection,
                },
              ],
      ),
    ]
    const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Array(PendingInput)))(retained).pipe(
      Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
    )
    if (retained.length > 64 || new TextEncoder().encode(encoded).byteLength > 1048576) {
      return yield* SessionQueueConflict.make({
        sessionId,
        reason: "capacity",
        hint: "The Session queue supports at most 64 entries and 1 MiB of encoded pending inputs and pinned settings. Remove or shorten pending input.",
      })
    }
  })

const promoteChild = ({
  state,
  sessionId,
  pending,
}: {
  readonly state: RuntimeState
  readonly sessionId: string
  readonly pending: PendingInput
}) =>
  Effect.gen(function* () {
    const stored = state.hostSessions.get(sessionId)!
    const hostSessions = new Map(state.hostSessions)
    hostSessions.set(sessionId, { ...stored, session: { ...stored.session, queue: stored.session.queue.slice(1) } })
    const sponsor = stored.session.sponsorRunId === undefined ? undefined : state.runs.get(stored.session.sponsorRunId)
    const continuation = state.sessions.get(sessionId)?.continuation
    if (
      sponsor === undefined ||
      sponsor.cancellationRequested ||
      continuation === undefined ||
      continuation.closed ||
      continuation.remainingRuns === 0
    )
      return state
    const selection = sponsor.executableManifest.profiles.find(
      (profile) =>
        resolveChild(sponsor.executableRef, sponsor.executableManifest, profile.selection)?.active ===
        pending.selection.executableRef.active,
    )?.selection
    if (selection === undefined) return state
    const result = yield* admitSpawn(
      { ...state, hostSessions },
      {
        parentRunId: sponsor.runId,
        invocationId: `session-message:${pending.id}`,
        selection,
        prompt: pending.prompt,
        sessionId,
        message: makeMessage({
          id: `session-message:${pending.id}`,
          to: makeAddress(`spawn:${sponsor.runId}`),
          sessionId,
          idempotencyKey: `session-message:${pending.id}`,
          correlationId: pending.id,
          prompt: pending.prompt,
        }),
        sponsoredContinuation: true,
      },
    ).pipe(Effect.result)
    if (result._tag === "Failure") {
      if (["generalist/core/RunBudgetExhausted", "generalist/runtime/ChildLimitExceeded"].includes(result.failure._tag))
        return state
      return yield* RuntimeUnavailable.make({ message: `Session message promotion failed: ${result.failure._tag}` })
    }
    const [receipt, admitted] = result.success
    let next = admitted
    if (!receipt.duplicate) {
      const runtimeSession = next.sessions.get(sessionId)
      if (runtimeSession?.continuation !== undefined) {
        const sessions = new Map(next.sessions)
        sessions.set(sessionId, {
          ...runtimeSession,
          continuation: {
            ...runtimeSession.continuation,
            remainingRuns: runtimeSession.continuation.remainingRuns - 1,
          },
        })
        next = { ...next, sessions }
      }
    }
    const sessions = new Map(next.hostSessions)
    const current = sessions.get(sessionId)!
    sessions.set(sessionId, { ...current, session: { ...current.session, activeRunId: receipt.runId } })
    return { ...next, hostSessions: sessions }
  })

export const promote = ({ state, sessionId }: { readonly state: RuntimeState; readonly sessionId: string }) =>
  Effect.gen(function* () {
    const stored = state.hostSessions.get(sessionId)
    const pending = stored?.session.queue[0]
    if (
      stored === undefined ||
      stored.session.lifecycle !== undefined ||
      pending === undefined ||
      stored.session.activeRunId !== undefined ||
      (state.lanes.get(laneKey(sessionId))?.queue.length ?? 0) > 0
    )
      return state
    const hostSessions = new Map(state.hostSessions)
    hostSessions.set(sessionId, { ...stored, session: { ...stored.session, queue: stored.session.queue.slice(1) } })
    const family = state.sessions.get(sessionId)?.family
    if (family !== undefined && family.parentRunId !== null) return yield* promoteChild({ state, sessionId, pending })

    const grant = yield* rootGrant({ state, sessionId, selection: pending.selection }).pipe(
      Effect.mapError((error) =>
        RuntimeUnavailable.make({ message: `Session input allocation failed: ${error._tag}` }),
      ),
    )
    if (firstExhausted(capGrant(grant.budget, yield* retainedBudget({ state, sessionId }))) !== undefined) return state
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

const authenticateSender = ({ state, input }: { readonly state: RuntimeState; readonly input: MessageInput }) =>
  Effect.gen(function* () {
    const family = state.sessions.get(input.sessionId)?.family
    const sender = "runId" in input.from ? state.runs.get(input.from.runId) : undefined
    if (
      "runId" in input.from &&
      (sender === undefined ||
        state.hostSessions.get(sender.message.sessionId)?.session.lifecycle === "closed" ||
        state.sessions.get(sender.message.sessionId)?.family?.rootSessionId !== family?.rootSessionId)
    )
      return yield* RuntimeUnavailable.make({ message: "Session sender is not an authenticated member of this family" })
    let from = makeAddress("user" in input.from ? `user:${input.from.user}` : "runtime:system")
    if (sender !== undefined) from = runAddress(sender.runId)
    return { family, sender, from }
  })

export const message = ({ state, input }: { readonly state: RuntimeState; readonly input: MessageInput }) =>
  Effect.gen(function* () {
    yield* validatePayload({ value: input, boundary: "Session message" })
    const stored = yield* sessionFor(state, input.sessionId)
    if (stored.session.lifecycle === "closed") return yield* rejectClosed(input.sessionId)
    const { family, sender, from } = yield* authenticateSender({ state, input })
    const active = stored.session.activeRunId === undefined ? undefined : state.runs.get(stored.session.activeRunId)
    const addressed = makeMessage({
      id: `session-message:${input.commandId}`,
      to: sessionAddress(input.sessionId),
      from,
      sessionId: input.sessionId,
      prompt: input.prompt,
      idempotencyKey: input.commandId,
      correlationId: input.commandId,
      metadata: {},
    })
    const prompt = deliveryPrompt({ from, messageId: addressed.id, prompt: input.prompt })
    if (stored.session.selection === undefined)
      return yield* SessionQueueConflict.make({ sessionId: input.sessionId, reason: "selection" })
    const item: PendingInput = {
      id: input.commandId,
      revision: 1,
      prompt,
      from: input.from,
      selection: stored.session.selection,
    }
    const queue = [...stored.session.queue, item]
    yield* validateQueue(state, input.sessionId, queue)
    const sponsored = new Map(state.hostSessions)
    if (sender !== undefined && sender.message.sessionId === family?.parentSessionId)
      sponsored.set(input.sessionId, { ...stored, session: { ...stored.session, sponsorRunId: sender.runId } })
    if (
      stored.session.lifecycle === undefined &&
      active !== undefined &&
      !isTerminal(active.status) &&
      !active.cancellationRequested &&
      active.pendingOutcome === undefined
    ) {
      const [, next] = yield* admitSteering(
        { ...state, hostSessions: sponsored },
        {
          sessionCommandId: input.commandId,
          runId: active.runId,
          idempotencyKey: input.commandId,
          prompt,
          from: input.from,
          policy: "steer",
          addressed,
          digest: digest({ prompt, from: input.from, policy: "steer", addressed }),
        },
      ).pipe(Effect.mapError((error) => RuntimeUnavailable.make({ message: `Session delivery failed: ${error._tag}` })))
      return [{ id: input.commandId, revision: 1 }, next] as const
    }
    const hostSessions = new Map(state.hostSessions)
    const session = { ...sponsored.get(input.sessionId)!.session, queue }
    hostSessions.set(input.sessionId, { ...stored, session })
    const next = yield* promote({ state: { ...state, hostSessions }, sessionId: input.sessionId })
    return [{ id: input.commandId, revision: 1 }, next] as const
  })

export const submit = ({ state, input }: { readonly state: RuntimeState; readonly input: SubmitInput }) =>
  Effect.gen(function* () {
    yield* validatePayload({ value: input, boundary: "Session input" })
    const stored = yield* sessionFor(state, input.sessionId)
    if (stored.session.lifecycle === "closed") return yield* rejectClosed(input.sessionId)
    const selection = yield* validateSelection({
      state,
      sessionId: input.sessionId,
      selection: input.selection ?? stored.session.selection,
      ceiling: stored.session.selection,
    })
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
    yield* validateQueue(state, input.sessionId, queue)
    const hostSessions = new Map(state.hostSessions)
    hostSessions.set(input.sessionId, { ...stored, session: { ...stored.session, selection, queue } })
    const next = yield* promote({ state: { ...state, hostSessions, registrationCatalog }, sessionId: input.sessionId })
    return [{ id: item.id, revision: item.revision }, next] as const
  })

export const update = ({ state, input }: { readonly state: RuntimeState; readonly input: UpdateInput | RemoveInput }) =>
  Effect.gen(function* () {
    yield* validatePayload({ value: input, boundary: "Session queue mutation" })
    const stored = yield* sessionFor(state, input.sessionId)
    if (stored.session.lifecycle === "closed") return yield* rejectClosed(input.sessionId)
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
            selection: yield* validateSelection({
              state,
              sessionId: input.sessionId,
              selection: input.selection ?? item.selection,
              ceiling: item.selection,
            }),
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
    yield* validateQueue(state, input.sessionId, queue)
    const hostSessions = new Map(state.hostSessions)
    hostSessions.set(input.sessionId, { ...stored, session: { ...stored.session, queue } })
    return [
      { id: item.id, revision },
      { ...state, hostSessions, registrationCatalog },
    ] as const
  })
