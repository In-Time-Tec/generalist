import {
  Cause,
  Clock,
  Context,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Queue,
  Random,
  Ref,
  Schema,
  Semaphore,
  Stream,
} from "effect"
import { Chat, Prompt, Tool } from "effect/unstable/ai"
import { Agent, AgentEvent, Approvals } from "@batonfx/core"
import type { ClientApproval, EventType, LooseServerFrameType, RunFailure, SessionStatus } from "./wire.js"
/** @experimental */
export class SessionError extends Schema.TaggedErrorClass<SessionError>()("@batonfx/transport/SessionError", {
  message: Schema.String,
}) {}

/** @experimental */
export class SessionBusy extends Schema.TaggedErrorClass<SessionBusy>()("@batonfx/transport/SessionBusy", {
  sessionId: Schema.String,
}) {}

/** @experimental */
export class SessionQueueFull extends Schema.TaggedErrorClass<SessionQueueFull>()(
  "@batonfx/transport/SessionQueueFull",
  {
    sessionId: Schema.String,
    capacity: Schema.Number,
  },
) {}

/** @experimental */
export class SubscriberLagged extends Schema.TaggedErrorClass<SubscriberLagged>()(
  "@batonfx/transport/SubscriberLagged",
  {
    sessionId: Schema.String,
    lastDeliveredSeq: Schema.Number,
  },
) {}

/** @experimental */
export interface SessionInfo {
  readonly sessionId: string
  readonly chatId: string
  readonly status: SessionStatus
  readonly lastSeq: number
  readonly idleSince: Option.Option<number>
  readonly pendingMessages: number
}

/** @experimental */
export interface MemoryOptions<Tools extends Record<string, Tool.Any>, HasModel extends boolean = boolean> {
  readonly agent: Agent.Agent<Tools, HasModel>
  readonly ringBufferCapacity?: number
  readonly subscriberQueueCapacity?: number
  readonly idleTimeout?: Duration.Input
  readonly stripTranscripts?: boolean
  readonly onConcurrentMessage?: "reject" | "enqueue"
  readonly pendingMessageCapacity?: number
  readonly maxConcurrentRuns?: number
}

/** @experimental */
export interface Interface {
  readonly open: (options: {
    readonly sessionId?: string
    readonly chatId?: string
    readonly system?: string
  }) => Effect.Effect<SessionInfo, SessionError>
  readonly send: (
    sessionId: string,
    prompt: Prompt.RawInput,
  ) => Effect.Effect<void, SessionError | SessionBusy | SessionQueueFull>
  readonly resolveApproval: (
    sessionId: string,
    token: string,
    decision: ClientApproval,
  ) => Effect.Effect<void, SessionError | SessionBusy>
  readonly attach: (
    sessionId: string,
    afterSeq?: number,
  ) => Stream.Stream<LooseServerFrameType, SessionError | SubscriberLagged>
  readonly interrupt: (sessionId: string) => Effect.Effect<void, SessionError>
  readonly info: (sessionId: string) => Effect.Effect<SessionInfo, SessionError>
}

/** @experimental */
export class SessionRegistry extends Context.Service<SessionRegistry, Interface>()(
  "@batonfx/transport/SessionRegistry",
) {}

type SubscriberQueue = Queue.Queue<LooseServerFrameType, SessionError | SubscriberLagged>

type RunReservation =
  | { readonly _tag: "Missing" }
  | { readonly _tag: "Busy" }
  | { readonly _tag: "Reserved"; readonly session: SessionState }

type RunSubmission = RunReservation | { readonly _tag: "Enqueued" } | { readonly _tag: "Full" }

interface PendingRun {
  readonly prompt: Prompt.RawInput
}

interface SessionState {
  readonly sessionId: string
  readonly chatId: string
  readonly system?: string
  readonly status: SessionStatus
  readonly lastSeq: number
  readonly ring: ReadonlyArray<LooseServerFrameType>
  readonly subscribers: ReadonlyMap<number, SubscriberQueue>
  readonly runFiber: Option.Option<Fiber.Fiber<void>>
  readonly interruptRequested: boolean
  readonly idleSince: Option.Option<number>
  readonly pendingRuns: ReadonlyArray<PendingRun>
  readonly runId: number
}

type InterruptAction =
  | { readonly _tag: "Missing" }
  | { readonly _tag: "Ignore" }
  | { readonly _tag: "Requested" }
  | { readonly _tag: "Stop"; readonly fiber: Fiber.Fiber<void>; readonly runId: number }

interface RegistryState {
  readonly sessions: ReadonlyMap<string, SessionState>
  readonly nextSubscriberId: number
}

type FrameWithoutSeq = LooseServerFrameType extends infer Frame
  ? Frame extends unknown
    ? Omit<Frame, "seq">
    : never
  : never

const errorMessage = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error)

const sessionError = (message: string): SessionError => new SessionError({ message })

const infoFrom = (session: SessionState): SessionInfo => ({
  sessionId: session.sessionId,
  chatId: session.chatId,
  status: session.status,
  lastSeq: session.lastSeq,
  idleSince: session.idleSince,
  pendingMessages: session.pendingRuns.length,
})

const trimRing = (ring: ReadonlyArray<LooseServerFrameType>, capacity: number): ReadonlyArray<LooseServerFrameType> =>
  ring.length <= capacity ? ring : ring.slice(ring.length - capacity)

const nonNegativeInteger = (name: string, value: number): Effect.Effect<number> =>
  Number.isSafeInteger(value) && value >= 0
    ? Effect.succeed(value)
    : Effect.die(new TypeError(`${name} must be a non-negative safe integer`))

const positiveInteger = (name: string, value: number): Effect.Effect<number> =>
  Number.isSafeInteger(value) && value > 0
    ? Effect.succeed(value)
    : Effect.die(new TypeError(`${name} must be a positive safe integer`))

const stripEventTranscript = (event: AgentEvent.Event, strip: boolean): EventType => {
  if (!strip) return event
  if (event._tag === "TurnCompleted") {
    const { transcript: _transcript, ...rest } = event
    return rest
  }
  if (event._tag === "Completed") {
    const { transcript: _transcript, ...rest } = event
    return rest
  }
  return event
}

const runFailureFromCause = (cause: Cause.Cause<Agent.RunError | SessionError>, turn: number): RunFailure => {
  const error = Cause.squash(cause)
  if (error instanceof AgentEvent.AgentError) return error
  if (error instanceof AgentEvent.TurnLimitExceeded) return error
  if (error instanceof AgentEvent.MiddlewareViolation) return error
  const message = Cause.hasInterrupts(cause) ? "Session interrupted" : errorMessage(error)
  return new AgentEvent.AgentError({ message, turn, cause: error })
}

const toApprovalDecision = (decision: ClientApproval): Approvals.Decision => {
  if (decision._tag === "Approved") return { _tag: "Approved" }
  return decision.reason === undefined ? { _tag: "Denied" } : { _tag: "Denied", reason: decision.reason }
}

/** @experimental */
export const layerMemory = <Tools extends Record<string, Tool.Any>, HasModel extends boolean>(
  options: MemoryOptions<Tools, HasModel>,
): Layer.Layer<SessionRegistry, never, Agent.RunServices<Tools, HasModel> | Chat.Persistence> =>
  Layer.effect(
    SessionRegistry,
    Effect.gen(function* () {
      const scope = yield* Effect.scope
      const context = yield* Effect.context<Agent.RunServices<Tools, HasModel> | Chat.Persistence>()
      const approvals = yield* Effect.serviceOption(Approvals.Approvals)
      const persistence = yield* Chat.Persistence
      const state = yield* Ref.make<RegistryState>({ sessions: new Map(), nextSubscriberId: 0 })
      const ringBufferCapacity = options.ringBufferCapacity ?? 1024
      const subscriberQueueCapacity = options.subscriberQueueCapacity ?? 128
      const idleTimeout = options.idleTimeout ?? "15 minutes"
      const idleTimeoutMillis = Duration.toMillis(idleTimeout)
      const stripTranscripts = options.stripTranscripts ?? false
      const onConcurrentMessage = options.onConcurrentMessage ?? "reject"
      const pendingMessageCapacity = yield* nonNegativeInteger(
        "pendingMessageCapacity",
        options.pendingMessageCapacity ?? 128,
      )
      const runSemaphore =
        options.maxConcurrentRuns === undefined
          ? undefined
          : yield* positiveInteger("maxConcurrentRuns", options.maxConcurrentRuns).pipe(Effect.flatMap(Semaphore.make))

      const lookup = (sessionId: string): Effect.Effect<SessionState, SessionError> =>
        Ref.get(state).pipe(
          Effect.flatMap((current) => {
            const session = current.sessions.get(sessionId)
            return session === undefined
              ? Effect.fail(sessionError(`Session ${sessionId} is not open`))
              : Effect.succeed(session)
          }),
        )

      const removeSubscriber = (sessionId: string, subscriberId: number): Effect.Effect<void> =>
        Ref.update(state, (current) => {
          const session = current.sessions.get(sessionId)
          if (session === undefined) return current
          const subscribers = new Map(session.subscribers)
          subscribers.delete(subscriberId)
          const sessions = new Map(current.sessions)
          sessions.set(sessionId, { ...session, subscribers })
          return { ...current, sessions }
        })

      const failSubscriber = (sessionId: string, subscriberId: number, queue: SubscriberQueue, lastSeq: number) =>
        Queue.fail(queue, new SubscriberLagged({ sessionId, lastDeliveredSeq: lastSeq })).pipe(
          Effect.andThen(removeSubscriber(sessionId, subscriberId)),
        )

      const failEvictedSubscriber = (sessionId: string, queue: SubscriberQueue) =>
        Queue.fail(queue, sessionError(`Session ${sessionId} was evicted`)).pipe(Effect.asVoid)

      const publish = (sessionId: string, input: FrameWithoutSeq): Effect.Effect<LooseServerFrameType, SessionError> =>
        Ref.modify(state, (current) => {
          const session = current.sessions.get(sessionId)
          if (session === undefined)
            return [Option.none<readonly [LooseServerFrameType, ReadonlyMap<number, SubscriberQueue>]>(), current]
          const frame = { ...input, seq: session.lastSeq + 1 } as LooseServerFrameType
          const updated = {
            ...session,
            lastSeq: frame.seq,
            ring: trimRing([...session.ring, frame], ringBufferCapacity),
          }
          const sessions = new Map(current.sessions)
          sessions.set(sessionId, updated)
          return [Option.some([frame, session.subscribers] as const), { ...current, sessions }]
        }).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(sessionError(`Session ${sessionId} is not open`)),
              onSome: ([frame, subscribers]) =>
                Effect.forEach(
                  subscribers,
                  ([subscriberId, queue]) =>
                    Queue.offer(queue, frame).pipe(
                      Effect.flatMap((offered) =>
                        offered ? Effect.void : failSubscriber(sessionId, subscriberId, queue, frame.seq - 1),
                      ),
                    ),
                  { discard: true },
                ).pipe(Effect.as(frame)),
            }),
          ),
        )

      const setStatus = (sessionId: string, runId: number, status: SessionStatus): Effect.Effect<void, SessionError> =>
        Clock.currentTimeMillis.pipe(
          Effect.flatMap((now) =>
            Ref.modify(state, (current) => {
              const session = current.sessions.get(sessionId)
              if (session === undefined || session.runId !== runId || session.status._tag !== "Running") {
                return [false, current]
              }
              const sessions = new Map(current.sessions)
              sessions.set(sessionId, {
                ...session,
                status,
                idleSince: status._tag === "Running" ? Option.none() : Option.some(now),
              })
              return [true, { ...current, sessions }]
            }),
          ),
          Effect.flatMap((updated) =>
            updated ? publish(sessionId, { _tag: "SessionStatus", status }).pipe(Effect.asVoid) : Effect.void,
          ),
        )

      const finalizeRun = (
        sessionId: string,
        runId: number,
        status: SessionStatus,
        outcome?: FrameWithoutSeq,
      ): Effect.Effect<void, SessionError> =>
        Clock.currentTimeMillis.pipe(
          Effect.flatMap((now) =>
            Ref.modify(state, (current) => {
              const session = current.sessions.get(sessionId)
              if (session === undefined || session.runId !== runId || session.status._tag !== "Running") {
                return [false, current]
              }
              const sessions = new Map(current.sessions)
              sessions.set(sessionId, {
                ...session,
                status,
                runFiber: Option.none(),
                idleSince: Option.some(now),
              })
              return [true, { ...current, sessions }]
            }),
          ),
          Effect.flatMap((finalized) =>
            finalized
              ? Effect.gen(function* () {
                  if (outcome !== undefined) yield* publish(sessionId, outcome)
                  yield* publish(sessionId, { _tag: "SessionStatus", status })
                  yield* publish(sessionId, { _tag: "Ended" })
                }).pipe(Effect.asVoid)
              : Effect.void,
          ),
        )

      const finalizeInterrupted = (sessionId: string, runId: number): Effect.Effect<void> => {
        const error = new AgentEvent.AgentError({ message: "Session interrupted", turn: 0 })
        return finalizeRun(sessionId, runId, { _tag: "Failed", error }, { _tag: "Failed", error }).pipe(Effect.ignore)
      }

      let drainAfterInterrupt = (_sessionId: string, _runId: number): Effect.Effect<void> => Effect.void

      const stopRun = (sessionId: string, runId: number, fiber: Fiber.Fiber<void>): Effect.Effect<void> =>
        Fiber.interrupt(fiber).pipe(
          Effect.andThen(finalizeInterrupted(sessionId, runId)),
          Effect.andThen(drainAfterInterrupt(sessionId, runId)),
        )

      const makeApprovals = (
        resume: Agent.Resume | undefined,
        decision: ClientApproval | undefined,
      ): Effect.Effect<Option.Option<Approvals.Interface>> => {
        if (resume === undefined || decision === undefined) return Effect.succeed(approvals)
        const fallbackApprovals = Option.getOrElse(approvals, () =>
          Approvals.Approvals.of({
            check: () =>
              Effect.succeed({
                _tag: "Denied",
                reason: "Approvals service is required for approval-gated tools",
              }),
          }),
        )
        return Ref.make(false).pipe(
          Effect.map((consumed) =>
            Option.some(
              Approvals.Approvals.of({
                check: (request) => {
                  if (request.call.id !== resume.call.id) return fallbackApprovals.check(request)
                  return Ref.modify(consumed, (used) => [!used, true]).pipe(
                    Effect.flatMap((useOverride) =>
                      useOverride ? Effect.succeed(toApprovalDecision(decision)) : fallbackApprovals.check(request),
                    ),
                  )
                },
              }),
            ),
          ),
        )
      }

      const runStream = (
        session: SessionState,
        prompt: Prompt.RawInput,
        resume: Agent.Resume | undefined,
        approvalDecision: ClientApproval | undefined,
      ): Effect.Effect<void> =>
        Effect.gen(function* () {
          const overrideApprovals = yield* makeApprovals(resume, approvalDecision)
          const runOptions: Agent.RunOptions = {
            prompt,
            sessionId: session.sessionId,
            ...(session.system === undefined ? {} : { system: session.system }),
            persistence: { chatId: session.chatId },
            ...(resume === undefined ? {} : { resume }),
          }
          const run = Agent.stream(options.agent, runOptions).pipe(
            Stream.runForEach((event) =>
              (event._tag === "TurnStarted"
                ? setStatus(session.sessionId, session.runId, { _tag: "Running", turn: event.turn })
                : Effect.void
              ).pipe(
                Effect.andThen(
                  publish(session.sessionId, { _tag: "Event", event: stripEventTranscript(event, stripTranscripts) }),
                ),
              ),
            ),
            Effect.matchCauseEffect({
              onFailure: (cause) => {
                const error = Cause.squash(cause)
                if (error instanceof AgentEvent.AgentSuspended) {
                  return finalizeRun(
                    session.sessionId,
                    session.runId,
                    { _tag: "Suspended", suspension: error },
                    { _tag: "Suspended", suspension: error },
                  )
                }
                const failure = runFailureFromCause(cause, 0)
                return finalizeRun(
                  session.sessionId,
                  session.runId,
                  { _tag: "Failed", error: failure },
                  { _tag: "Failed", error: failure },
                )
              },
              onSuccess: () => finalizeRun(session.sessionId, session.runId, { _tag: "Idle" }),
            }),
            Effect.catchCause(() => Effect.void),
          )
          const runContext = Option.match(overrideApprovals, {
            onNone: () => context,
            onSome: (overrideService) => Context.add(context, Approvals.Approvals, overrideService),
          })
          return yield* run.pipe(Effect.provide(runContext))
        })

      const reserveRun = (
        sessionId: string,
        resume: Agent.Resume | undefined,
      ): Effect.Effect<SessionState, SessionError | SessionBusy> =>
        Ref.modify(state, (current): readonly [RunReservation, RegistryState] => {
          const session = current.sessions.get(sessionId)
          if (session === undefined) return [{ _tag: "Missing" } satisfies RunReservation, current]
          if (session.status._tag === "Running" || (session.status._tag === "Suspended" && resume === undefined)) {
            return [{ _tag: "Busy" } satisfies RunReservation, current]
          }
          const updated: SessionState = {
            ...session,
            runId: session.runId + 1,
            status: { _tag: "Running", turn: 0 },
            runFiber: Option.none(),
            interruptRequested: false,
            idleSince: Option.none(),
          }
          const sessions = new Map(current.sessions)
          sessions.set(sessionId, updated)
          return [{ _tag: "Reserved", session: updated } satisfies RunReservation, { ...current, sessions }]
        }).pipe(
          Effect.flatMap((reservation): Effect.Effect<SessionState, SessionError | SessionBusy> => {
            switch (reservation._tag) {
              case "Missing":
                return Effect.fail(sessionError(`Session ${sessionId} is not open`))
              case "Busy":
                return Effect.fail(new SessionBusy({ sessionId }))
              case "Reserved":
                return Effect.succeed(reservation.session)
            }
          }),
        )

      const reserveOrEnqueue = (
        sessionId: string,
        prompt: Prompt.RawInput,
      ): Effect.Effect<RunSubmission, SessionError | SessionBusy | SessionQueueFull> =>
        Ref.modify(state, (current): readonly [RunSubmission, RegistryState] => {
          const session = current.sessions.get(sessionId)
          if (session === undefined) return [{ _tag: "Missing" }, current]
          const busy =
            session.status._tag === "Running" || session.status._tag === "Suspended" || session.pendingRuns.length > 0
          if (busy) {
            if (onConcurrentMessage === "reject") return [{ _tag: "Busy" }, current]
            if (session.pendingRuns.length >= pendingMessageCapacity) return [{ _tag: "Full" }, current]
            const sessions = new Map(current.sessions)
            sessions.set(sessionId, { ...session, pendingRuns: [...session.pendingRuns, { prompt }] })
            return [{ _tag: "Enqueued" }, { ...current, sessions }]
          }
          const updated: SessionState = {
            ...session,
            runId: session.runId + 1,
            status: { _tag: "Running", turn: 0 },
            runFiber: Option.none(),
            interruptRequested: false,
            idleSince: Option.none(),
          }
          const sessions = new Map(current.sessions)
          sessions.set(sessionId, updated)
          return [
            { _tag: "Reserved", session: updated },
            { ...current, sessions },
          ]
        }).pipe(
          Effect.flatMap((submission): Effect.Effect<RunSubmission, SessionError | SessionBusy | SessionQueueFull> => {
            switch (submission._tag) {
              case "Missing":
                return Effect.fail(sessionError(`Session ${sessionId} is not open`))
              case "Busy":
                return Effect.fail(new SessionBusy({ sessionId }))
              case "Full":
                return Effect.fail(new SessionQueueFull({ sessionId, capacity: pendingMessageCapacity }))
              case "Enqueued":
              case "Reserved":
                return Effect.succeed(submission)
            }
          }),
        )

      const reserveNextRun = (
        sessionId: string,
        completedRunId: number,
      ): Effect.Effect<Option.Option<readonly [SessionState, PendingRun]>> =>
        Ref.modify(state, (current) => {
          const session = current.sessions.get(sessionId)
          if (
            session === undefined ||
            session.runId !== completedRunId ||
            session.status._tag === "Running" ||
            session.status._tag === "Suspended" ||
            session.pendingRuns.length === 0
          ) {
            return [Option.none<readonly [SessionState, PendingRun]>(), current]
          }
          const [next, ...pendingRuns] = session.pendingRuns
          if (next === undefined) return [Option.none<readonly [SessionState, PendingRun]>(), current]
          const updated: SessionState = {
            ...session,
            runId: session.runId + 1,
            status: { _tag: "Running", turn: 0 },
            runFiber: Option.none(),
            interruptRequested: false,
            idleSince: Option.none(),
            pendingRuns,
          }
          const sessions = new Map(current.sessions)
          sessions.set(sessionId, updated)
          return [Option.some([updated, next] as const), { ...current, sessions }]
        })

      let launchRun: (
        session: SessionState,
        prompt: Prompt.RawInput,
        resume?: Agent.Resume,
        approvalDecision?: ClientApproval,
      ) => Effect.Effect<void, SessionError>

      const drainNext = (sessionId: string, completedRunId: number): Effect.Effect<void> =>
        reserveNextRun(sessionId, completedRunId).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.void,
              onSome: ([session, pending]) => launchRun(session, pending.prompt).pipe(Effect.ignore),
            }),
          ),
        )

      drainAfterInterrupt = drainNext

      launchRun = (
        runSession: SessionState,
        prompt: Prompt.RawInput,
        resume?: Agent.Resume,
        approvalDecision?: ClientApproval,
      ): Effect.Effect<void, SessionError> =>
        Effect.gen(function* () {
          yield* publish(runSession.sessionId, { _tag: "SessionStatus", status: runSession.status })
          const run = runStream(runSession, prompt, resume, approvalDecision)
          const governed = runSemaphore === undefined ? run : runSemaphore.withPermits(1)(run)
          const fiber = yield* governed.pipe(
            Effect.onExit((exit) =>
              Exit.hasInterrupts(exit) ? Effect.void : drainNext(runSession.sessionId, runSession.runId),
            ),
            Effect.forkIn(scope),
          )
          const stopRequested = yield* Ref.modify(state, (current): readonly [boolean, RegistryState] => {
            const session = current.sessions.get(runSession.sessionId)
            if (session === undefined || session.runId !== runSession.runId || session.status._tag !== "Running") {
              return [false, current]
            }
            const updated: SessionState = {
              ...session,
              runFiber: Option.some(fiber),
              interruptRequested: false,
              idleSince: Option.none(),
            }
            const sessions = new Map(current.sessions)
            sessions.set(runSession.sessionId, updated)
            return [session.interruptRequested, { ...current, sessions }]
          })
          if (stopRequested) yield* stopRun(runSession.sessionId, runSession.runId, fiber)
        })

      const beginRun = (
        sessionId: string,
        prompt: Prompt.RawInput,
        resume?: Agent.Resume,
        approvalDecision?: ClientApproval,
      ): Effect.Effect<void, SessionError | SessionBusy> =>
        Effect.gen(function* () {
          const runSession = yield* reserveRun(sessionId, resume)
          yield* launchRun(runSession, prompt, resume, approvalDecision)
        })

      const snapshotFrame = (
        sessionId: string,
        seq: number,
        chatId: string,
      ): Effect.Effect<LooseServerFrameType, SessionError> =>
        persistence.getOrCreate(chatId).pipe(
          Effect.flatMap((chat) => Ref.get(chat.history)),
          Effect.map((transcript) => ({ _tag: "Snapshot", seq, transcript }) as LooseServerFrameType),
          Effect.mapError((error) => sessionError(errorMessage(error))),
        )

      const sweep = Clock.currentTimeMillis.pipe(
        Effect.flatMap((now) =>
          Ref.modify(state, (current) => {
            const sessions = new Map(current.sessions)
            const evicted: Array<readonly [string, ReadonlyArray<SubscriberQueue>, Option.Option<Fiber.Fiber<void>>]> =
              []
            for (const [sessionId, session] of current.sessions) {
              if (
                session.status._tag === "Running" ||
                session.pendingRuns.length > 0 ||
                Option.isNone(session.idleSince)
              )
                continue
              if (now - session.idleSince.value >= idleTimeoutMillis) {
                sessions.delete(sessionId)
                evicted.push([sessionId, Array.from(session.subscribers.values()), session.runFiber] as const)
              }
            }
            return [evicted, { ...current, sessions }]
          }),
        ),
        Effect.flatMap((evicted) =>
          Effect.forEach(
            evicted,
            ([sessionId, subscribers, runFiber]) =>
              Effect.all(
                [
                  Option.match(runFiber, { onNone: () => Effect.void, onSome: Fiber.interrupt }),
                  Effect.forEach(subscribers, (queue) => failEvictedSubscriber(sessionId, queue), { discard: true }),
                ],
                { discard: true },
              ),
            { discard: true },
          ),
        ),
      )

      yield* Effect.sleep(idleTimeout).pipe(Effect.andThen(sweep), Effect.forever, Effect.forkIn(scope))

      yield* Effect.addFinalizer(() =>
        Ref.get(state).pipe(
          Effect.flatMap((current) =>
            Effect.forEach(
              current.sessions.values(),
              (session) =>
                Effect.all(
                  [
                    Option.match(session.runFiber, { onNone: () => Effect.void, onSome: Fiber.interrupt }),
                    Effect.forEach(session.subscribers.values(), Queue.shutdown, { discard: true }),
                  ],
                  { discard: true },
                ),
              { discard: true },
            ),
          ),
        ),
      )

      return SessionRegistry.of({
        open: (openOptions) =>
          Effect.gen(function* () {
            const sessionId = openOptions.sessionId ?? `session-${yield* Random.nextIntBetween(100000, 1000000)}`
            const chatId = openOptions.chatId ?? sessionId
            const now = yield* Clock.currentTimeMillis
            yield* persistence.getOrCreate(chatId).pipe(Effect.mapError((error) => sessionError(errorMessage(error))))
            const info = yield* Ref.modify(state, (current) => {
              const existing = current.sessions.get(sessionId)
              if (existing !== undefined) return [infoFrom(existing), current]
              const session: SessionState = {
                sessionId,
                chatId,
                ...(openOptions.system === undefined ? {} : { system: openOptions.system }),
                status: { _tag: "Idle" },
                lastSeq: -1,
                ring: [],
                subscribers: new Map(),
                runFiber: Option.none(),
                interruptRequested: false,
                idleSince: Option.some(now),
                pendingRuns: [],
                runId: 0,
              }
              const sessions = new Map(current.sessions)
              sessions.set(sessionId, session)
              return [infoFrom(session), { ...current, sessions }]
            })
            return info
          }),
        send: (sessionId, prompt) =>
          reserveOrEnqueue(sessionId, prompt).pipe(
            Effect.flatMap((submission) =>
              submission._tag === "Reserved" ? launchRun(submission.session, prompt) : Effect.void,
            ),
          ),
        resolveApproval: (sessionId, token, decision) =>
          Effect.gen(function* () {
            const session = yield* lookup(sessionId)
            if (session.status._tag !== "Suspended")
              return yield* Effect.fail(sessionError(`Session ${sessionId} is not suspended`))
            const suspension = session.status.suspension
            if (suspension.reason !== "approval")
              return yield* Effect.fail(sessionError(`Session ${sessionId} is not waiting on approval`))
            if (suspension.token !== token)
              return yield* Effect.fail(sessionError(`Approval token ${token} does not match session ${sessionId}`))
            yield* beginRun(
              sessionId,
              "",
              {
                call: {
                  id: suspension.tool_call_id,
                  name: suspension.tool_name,
                  params: suspension.tool_params,
                },
              },
              decision,
            )
          }),
        attach: (sessionId, afterSeq) =>
          Stream.unwrap(
            Effect.gen(function* () {
              const queue = yield* Queue.make<LooseServerFrameType, SessionError | SubscriberLagged>({
                capacity: subscriberQueueCapacity,
                strategy: "dropping",
              })
              const attached = yield* Ref.modify(state, (current) => {
                const session = current.sessions.get(sessionId)
                if (session === undefined)
                  return [
                    Option.none<{
                      readonly subscriberId: number
                      readonly replay: ReadonlyArray<LooseServerFrameType>
                      readonly stale: boolean
                      readonly snapshotSeq: number
                      readonly chatId: string
                    }>(),
                    current,
                  ]
                const subscriberId = current.nextSubscriberId
                const floor = session.ring[0]?.seq ?? session.lastSeq + 1
                const cursor = afterSeq ?? floor - 1
                const stale = afterSeq !== undefined && afterSeq < floor - 1
                const replay = stale ? [] : session.ring.filter((frame) => frame.seq > cursor)
                const subscribers = new Map(session.subscribers)
                subscribers.set(subscriberId, queue)
                const sessions = new Map(current.sessions)
                sessions.set(sessionId, { ...session, subscribers })
                return [
                  Option.some({ subscriberId, replay, stale, snapshotSeq: session.lastSeq, chatId: session.chatId }),
                  { sessions, nextSubscriberId: subscriberId + 1 },
                ]
              })
              const details = yield* Option.match(attached, {
                onNone: () => Effect.fail(sessionError(`Session ${sessionId} is not open`)),
                onSome: Effect.succeed,
              })
              const prefix = details.stale
                ? Stream.fromEffect(snapshotFrame(sessionId, details.snapshotSeq, details.chatId))
                : Stream.fromIterable(details.replay)
              return Stream.concat(prefix, Stream.fromQueue(queue)).pipe(
                Stream.ensuring(removeSubscriber(sessionId, details.subscriberId).pipe(Effect.asVoid)),
              )
            }),
          ),
        interrupt: (sessionId) =>
          Ref.modify(state, (current): readonly [InterruptAction, RegistryState] => {
            const session = current.sessions.get(sessionId)
            if (session === undefined) return [{ _tag: "Missing" }, current]
            if (Option.isSome(session.runFiber))
              return [{ _tag: "Stop", fiber: session.runFiber.value, runId: session.runId }, current]
            if (session.status._tag !== "Running") return [{ _tag: "Ignore" }, current]
            const sessions = new Map(current.sessions)
            sessions.set(sessionId, { ...session, interruptRequested: true })
            return [{ _tag: "Requested" }, { ...current, sessions }]
          }).pipe(
            Effect.flatMap((action): Effect.Effect<void, SessionError> => {
              switch (action._tag) {
                case "Missing":
                  return Effect.fail(sessionError(`Session ${sessionId} is not open`))
                case "Stop":
                  return stopRun(sessionId, action.runId, action.fiber)
                case "Requested":
                case "Ignore":
                  return Effect.void
              }
            }),
          ),
        info: (sessionId) => lookup(sessionId).pipe(Effect.map(infoFrom)),
      })
    }),
  )
