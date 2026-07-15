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
import { Agent, AgentEvent, Approvals, Permissions, ToolExecutor, TurnPolicy } from "@batonfx/core"
import { type FrameJournal, type FrameWithoutSeq, makeFrameJournal } from "./frame-journal.js"
import {
  coordination,
  type CoordinationState,
  type CoordinationSubmission,
  type InterruptAction,
  type PendingRun,
  type RunReservation,
} from "./session-coordination.js"
import { SessionBusy, SessionError, SessionQueueFull, SubscriberLagged } from "./session-registry-errors.js"
import type { ClientApproval, EventType, LooseServerFrameType, RunFailure, SessionStatus } from "./wire.js"

export { SessionBusy, SessionError, SessionQueueFull, SubscriberLagged } from "./session-registry-errors.js"

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
export interface MemoryOptions<Tools extends Record<string, Tool.Any>, R> {
  readonly agent: Agent.Agent<Tools, R>
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
  "@batonfx/transport/session-registry/SessionRegistry",
) {}

interface SessionState {
  readonly sessionId: string
  readonly chatId: string
  readonly chat: Ref.Ref<Chat.Persisted>
  readonly system?: string
  readonly coordination: CoordinationState
  readonly journal: FrameJournal
}

interface RegistryState {
  readonly sessions: ReadonlyMap<string, SessionState>
}

type RunSubmission = { readonly _tag: "Enqueued" } | { readonly _tag: "Reserved"; readonly session: SessionState }

const errorMessage = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error)

const sessionError = (message: string): SessionError => SessionError.make({ message })

const infoFrom = (session: SessionState): Effect.Effect<SessionInfo> =>
  session.journal.lastSeq.pipe(
    Effect.map((lastSeq) => ({
      sessionId: session.sessionId,
      chatId: session.chatId,
      status: session.coordination.status,
      lastSeq,
      idleSince: session.coordination.idleSince,
      pendingMessages: session.coordination.pendingRuns.length,
    })),
  )

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
  if (Schema.is(AgentEvent.AgentError)(error)) return error
  if (Schema.is(AgentEvent.ResumeMismatch)(error)) return error
  if (Schema.is(TurnPolicy.TurnPolicyError)(error)) return error
  if (Schema.is(AgentEvent.TurnPolicyStopped)(error)) return error
  if (Schema.is(AgentEvent.TurnLimitExceeded)(error)) return error
  if (Schema.is(AgentEvent.MiddlewareViolation)(error)) return error
  if (Schema.is(ToolExecutor.FrameworkFailure)(error)) return error
  const message = Cause.hasInterrupts(cause) ? "Session interrupted" : errorMessage(error)
  return AgentEvent.AgentError.make({ message, turn, cause: error })
}

const toApprovalDecision = (decision: ClientApproval): Approvals.Decision => {
  if (decision._tag === "Approved") return { _tag: "Approved" }
  return decision.reason === undefined ? { _tag: "Denied" } : { _tag: "Denied", reason: decision.reason }
}

/** @experimental */
export const layerMemory = <Tools extends Record<string, Tool.Any>, R>(
  options: MemoryOptions<Tools, R>,
): Layer.Layer<SessionRegistry, never, R | Chat.Persistence> =>
  Layer.effect(
    SessionRegistry,
    Effect.gen(function* () {
      const scope = yield* Effect.scope
      const context = yield* Effect.context<R | Chat.Persistence>()
      const approvals = yield* Effect.serviceOption(Approvals.Approvals)
      const permissions = yield* Effect.serviceOption(Permissions.Permissions)
      const persistence = yield* Chat.Persistence
      const state = yield* Ref.make<RegistryState>({ sessions: new Map() })
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

      const publish = (
        sessionId: string,
        input: FrameWithoutSeq,
        transcript?: Prompt.Prompt,
      ): Effect.Effect<LooseServerFrameType, SessionError> =>
        lookup(sessionId).pipe(Effect.flatMap((session) => session.journal.publish(input, transcript)))

      const setStatus = (sessionId: string, runId: number, status: SessionStatus): Effect.Effect<void, SessionError> =>
        Clock.currentTimeMillis.pipe(
          Effect.flatMap((now) =>
            Ref.modify(state, (current): readonly [boolean, RegistryState] => {
              const session = current.sessions.get(sessionId)
              if (session === undefined) return [false, current]
              const [updated, nextCoordination] = coordination.setStatus(session.coordination, runId, status, now)
              if (!updated) return [false, current]
              const sessions = new Map(current.sessions)
              sessions.set(sessionId, { ...session, coordination: nextCoordination })
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
        transcript?: Prompt.Prompt,
      ): Effect.Effect<void, SessionError> =>
        Clock.currentTimeMillis.pipe(
          Effect.flatMap((now) =>
            Ref.modify(state, (current): readonly [boolean, RegistryState] => {
              const session = current.sessions.get(sessionId)
              if (session === undefined) return [false, current]
              const [finalized, nextCoordination] = coordination.finalizeRun(session.coordination, runId, status, now)
              if (!finalized) return [false, current]
              const sessions = new Map(current.sessions)
              sessions.set(sessionId, { ...session, coordination: nextCoordination })
              return [true, { ...current, sessions }]
            }),
          ),
          Effect.flatMap((finalized) =>
            finalized
              ? Effect.gen(function* () {
                  if (outcome !== undefined) yield* publish(sessionId, outcome, transcript)
                  yield* publish(sessionId, { _tag: "SessionStatus", status })
                  yield* publish(sessionId, { _tag: "Ended" })
                }).pipe(Effect.asVoid)
              : Effect.void,
          ),
        )

      const finalizeInterrupted = (sessionId: string, runId: number): Effect.Effect<void> => {
        const error = AgentEvent.AgentError.make({ message: "Session interrupted", turn: 0 })
        return lookup(sessionId).pipe(
          Effect.flatMap((session) => Ref.get(session.chat)),
          Effect.flatMap((chat) => Ref.get(chat.history)),
          Effect.flatMap((transcript) =>
            finalizeRun(sessionId, runId, { _tag: "Failed", error }, { _tag: "Failed", error }, transcript),
          ),
          Effect.ignore,
        )
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
        if (resume === undefined || decision === undefined || resume.suspension.authorization_stage !== "approval") {
          return Effect.succeed(approvals)
        }
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
                  if (request.call.id !== resume.suspension.tool_call_id) return fallbackApprovals.check(request)
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

      const makePermissions = (
        resume: Agent.Resume | undefined,
        decision: ClientApproval | undefined,
      ): Effect.Effect<Option.Option<Permissions.Interface>> => {
        if (resume === undefined || decision === undefined || resume.suspension.authorization_stage !== "permission") {
          return Effect.succeed(permissions)
        }
        const fallbackPermissions = Option.getOrElse(permissions, () =>
          Permissions.Permissions.of({
            evaluate: () => Effect.succeed({ _tag: "Ask", token: `permission:${resume.suspension.tool_call_id}` }),
            await: () => Effect.succeedNone,
          }),
        )
        return Ref.make(false).pipe(
          Effect.map((consumed) =>
            Option.some(
              Permissions.Permissions.of({
                evaluate: fallbackPermissions.evaluate,
                await: (pending) => {
                  if (pending.toolCallId !== resume.suspension.tool_call_id) return fallbackPermissions.await(pending)
                  return Ref.modify(consumed, (used) => [!used, true]).pipe(
                    Effect.flatMap((useOverride) => {
                      if (!useOverride) return fallbackPermissions.await(pending)
                      return Effect.succeed(
                        Option.some(
                          decision._tag === "Approved"
                            ? ({ _tag: "Approved" } as const)
                            : decision.reason === undefined
                              ? ({ _tag: "Denied" } as const)
                              : ({ _tag: "Denied", reason: decision.reason } as const),
                        ),
                      )
                    }),
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
          const overridePermissions = yield* makePermissions(resume, approvalDecision)
          const runOptions = {
            prompt,
            sessionId: session.sessionId,
            ...(session.system === undefined ? {} : { system: session.system }),
            persistence: { chatId: session.chatId },
            ...(resume === undefined ? {} : { resume }),
          }
          const run = Agent.persisted(options.agent, runOptions).pipe(
            Stream.runForEach((event) =>
              (event._tag === "TurnStarted"
                ? setStatus(session.sessionId, session.coordination.runId, { _tag: "Running", turn: event.turn })
                : Effect.void
              ).pipe(
                Effect.andThen(
                  publish(
                    session.sessionId,
                    { _tag: "Event", event: stripEventTranscript(event, stripTranscripts) },
                    event._tag === "TurnCompleted" || event._tag === "Completed" ? event.transcript : undefined,
                  ),
                ),
              ),
            ),
            Effect.matchCauseEffect({
              onFailure: (cause) =>
                Ref.get(session.chat).pipe(
                  Effect.flatMap((chat) => Ref.get(chat.history)),
                  Effect.flatMap((transcript) => {
                    const error = Cause.squash(cause)
                    if (Schema.is(AgentEvent.AgentSuspended)(error)) {
                      return finalizeRun(
                        session.sessionId,
                        session.coordination.runId,
                        { _tag: "Suspended", suspension: error },
                        { _tag: "Suspended", suspension: error },
                        transcript,
                      )
                    }
                    const failure = runFailureFromCause(cause, 0)
                    return finalizeRun(
                      session.sessionId,
                      session.coordination.runId,
                      { _tag: "Failed", error: failure },
                      { _tag: "Failed", error: failure },
                      transcript,
                    )
                  }),
                ),
              onSuccess: () => finalizeRun(session.sessionId, session.coordination.runId, { _tag: "Idle" }),
            }),
            Effect.ignoreCause,
          )
          const approvalContext = Option.match(overrideApprovals, {
            onNone: () => context,
            onSome: (overrideService) => Context.add(context, Approvals.Approvals, overrideService),
          })
          const permissionContext = Option.match(overridePermissions, {
            onNone: () => approvalContext,
            onSome: (overrideService) => Context.add(approvalContext, Permissions.Permissions, overrideService),
          })
          const runPersistence = Chat.Persistence.of({
            get: (chatId, chatOptions) =>
              chatId === session.chatId
                ? persistence.get(chatId, chatOptions).pipe(Effect.tap((chat) => Ref.set(session.chat, chat)))
                : persistence.get(chatId, chatOptions),
            getOrCreate: (chatId, chatOptions) =>
              chatId === session.chatId
                ? persistence.getOrCreate(chatId, chatOptions).pipe(Effect.tap((chat) => Ref.set(session.chat, chat)))
                : persistence.getOrCreate(chatId, chatOptions),
          })
          const runContext = Context.add(permissionContext, Chat.Persistence, runPersistence)
          return yield* run.pipe(Effect.provide(runContext))
        })

      const reserveRun = (
        sessionId: string,
        resume: Agent.Resume | undefined,
      ): Effect.Effect<SessionState, SessionError | SessionBusy> =>
        Ref.modify(state, (current): readonly [Option.Option<RunReservation>, RegistryState] => {
          const session = current.sessions.get(sessionId)
          if (session === undefined) return [Option.none(), current]
          const [reservation, nextCoordination] = coordination.reserveRun(session.coordination, resume !== undefined)
          const sessions = new Map(current.sessions)
          sessions.set(sessionId, { ...session, coordination: nextCoordination })
          return [Option.some(reservation), { ...current, sessions }]
        }).pipe(
          Effect.flatMap((optional): Effect.Effect<SessionState, SessionError | SessionBusy> => {
            if (Option.isNone(optional)) return Effect.fail(sessionError(`Session ${sessionId} is not open`))
            const reservation = optional.value
            switch (reservation._tag) {
              case "Busy":
                return Effect.fail(SessionBusy.make({ sessionId }))
              case "Reserved":
                return lookup(sessionId)
            }
          }),
        )

      const reserveOrEnqueue = (
        sessionId: string,
        prompt: Prompt.RawInput,
      ): Effect.Effect<RunSubmission, SessionError | SessionBusy | SessionQueueFull> =>
        Ref.modify(state, (current): readonly [Option.Option<CoordinationSubmission>, RegistryState] => {
          const session = current.sessions.get(sessionId)
          if (session === undefined) return [Option.none(), current]
          const [submission, nextCoordination] = coordination.submitRun(
            session.coordination,
            prompt,
            onConcurrentMessage === "enqueue",
            pendingMessageCapacity,
          )
          const sessions = new Map(current.sessions)
          sessions.set(sessionId, { ...session, coordination: nextCoordination })
          return [Option.some(submission), { ...current, sessions }]
        }).pipe(
          Effect.flatMap((optional): Effect.Effect<RunSubmission, SessionError | SessionBusy | SessionQueueFull> => {
            if (Option.isNone(optional)) return Effect.fail(sessionError(`Session ${sessionId} is not open`))
            const submission = optional.value
            switch (submission._tag) {
              case "Busy":
                return Effect.fail(SessionBusy.make({ sessionId }))
              case "Full":
                return Effect.fail(SessionQueueFull.make({ sessionId, capacity: pendingMessageCapacity }))
              case "Enqueued":
                return Effect.succeed(submission)
              case "Reserved":
                return lookup(sessionId).pipe(Effect.map((session) => ({ _tag: "Reserved" as const, session })))
            }
          }),
        )

      const reserveNextRun = (
        sessionId: string,
        completedRunId: number,
      ): Effect.Effect<Option.Option<readonly [SessionState, PendingRun]>> =>
        Ref.modify(state, (current) => {
          const session = current.sessions.get(sessionId)
          if (session === undefined) return [Option.none<readonly [SessionState, PendingRun]>(), current]
          const [next, nextCoordination] = coordination.reserveNextRun(session.coordination, completedRunId)
          if (Option.isNone(next)) return [Option.none<readonly [SessionState, PendingRun]>(), current]
          const updated = { ...session, coordination: nextCoordination }
          const sessions = new Map(current.sessions)
          sessions.set(sessionId, updated)
          return [Option.some([updated, next.value[1]] as const), { ...current, sessions }]
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
          yield* publish(runSession.sessionId, { _tag: "SessionStatus", status: runSession.coordination.status })
          const run = runStream(runSession, prompt, resume, approvalDecision)
          const governed = runSemaphore === undefined ? run : runSemaphore.withPermits(1)(run)
          const fiber = yield* governed.pipe(
            Effect.onExit((exit) =>
              Exit.hasInterrupts(exit) ? Effect.void : drainNext(runSession.sessionId, runSession.coordination.runId),
            ),
            Effect.forkIn(scope),
          )
          const stopRequested = yield* Ref.modify(state, (current): readonly [boolean, RegistryState] => {
            const session = current.sessions.get(runSession.sessionId)
            if (session === undefined) return [false, current]
            const [requested, nextCoordination] = coordination.recordRunFiber(
              session.coordination,
              runSession.coordination.runId,
              fiber,
            )
            if (nextCoordination === session.coordination) return [false, current]
            const sessions = new Map(current.sessions)
            sessions.set(runSession.sessionId, { ...session, coordination: nextCoordination })
            return [requested, { ...current, sessions }]
          })
          if (stopRequested) yield* stopRun(runSession.sessionId, runSession.coordination.runId, fiber)
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

      const sweep = Clock.currentTimeMillis.pipe(
        Effect.flatMap((now) =>
          Ref.modify(state, (current) => {
            const sessions = new Map(current.sessions)
            const evicted: Array<SessionState> = []
            for (const [sessionId, session] of current.sessions) {
              if (coordination.isEvictable(session.coordination, now, idleTimeoutMillis)) {
                sessions.delete(sessionId)
                evicted.push(session)
              }
            }
            return [evicted, { ...current, sessions }]
          }),
        ),
        Effect.flatMap((evicted) =>
          Effect.uninterruptible(
            Effect.forEach(
              evicted,
              (session) => {
                const ownership = coordination.close(session.coordination)
                return Effect.all(
                  [
                    Option.match(ownership.runFiber, { onNone: () => Effect.void, onSome: Fiber.interrupt }),
                    session.journal.evict,
                  ],
                  { discard: true },
                )
              },
              { discard: true },
            ),
          ),
        ),
      )

      yield* Effect.sleep(idleTimeout).pipe(Effect.andThen(sweep), Effect.forever, Effect.forkIn(scope))

      yield* Effect.addFinalizer(() =>
        Ref.get(state).pipe(
          Effect.flatMap((current) =>
            Effect.forEach(
              current.sessions.values(),
              (session) => {
                const ownership = coordination.close(session.coordination)
                return Effect.all(
                  [
                    Option.match(ownership.runFiber, { onNone: () => Effect.void, onSome: Fiber.interrupt }),
                    session.journal.shutdown,
                  ],
                  { discard: true },
                )
              },
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
            const chat = yield* persistence
              .getOrCreate(chatId)
              .pipe(Effect.mapError((error) => error.pipe(errorMessage, sessionError)))
            const initialTranscript = yield* Ref.get(chat.history)
            const chatRef = yield* Ref.make(chat)
            const journal = yield* makeFrameJournal({ sessionId, capacity: ringBufferCapacity, initialTranscript })
            const [session, inserted] = yield* Ref.modify(
              state,
              (current): readonly [readonly [SessionState, boolean], RegistryState] => {
                const existing = current.sessions.get(sessionId)
                if (existing !== undefined) return [[existing, false] as const, current]
                const created: SessionState = {
                  sessionId,
                  chatId,
                  chat: chatRef,
                  ...(openOptions.system === undefined ? {} : { system: openOptions.system }),
                  coordination: coordination.make(now),
                  journal,
                }
                const sessions = new Map(current.sessions)
                sessions.set(sessionId, created)
                return [[created, true] as const, { ...current, sessions }]
              },
            )
            if (!inserted) yield* journal.shutdown
            return yield* infoFrom(session)
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
            if (session.coordination.status._tag !== "Suspended")
              return yield* sessionError(`Session ${sessionId} is not suspended`)
            const suspension = session.coordination.status.suspension
            if (suspension.reason !== "approval")
              return yield* sessionError(`Session ${sessionId} is not waiting on approval`)
            if (suspension.token !== token)
              return yield* sessionError(`Approval token ${token} does not match session ${sessionId}`)
            yield* beginRun(sessionId, "", { suspension }, decision)
          }),
        attach: (sessionId, afterSeq) =>
          Stream.unwrap(
            Effect.gen(function* () {
              const queue = yield* Queue.make<LooseServerFrameType, SessionError | SubscriberLagged>({
                capacity: subscriberQueueCapacity,
                strategy: "dropping",
              })
              const session = yield* lookup(sessionId)
              const details = yield* Effect.acquireRelease(session.journal.subscribe(queue, afterSeq), (subscription) =>
                session.journal.removeSubscriber(subscription.subscriberId),
              )
              const prefix = Option.match(details.snapshot, {
                onNone: () => Stream.fromIterable(details.replay),
                onSome: (snapshot) =>
                  Stream.concat(
                    Stream.make({
                      _tag: "Snapshot" as const,
                      seq: snapshot.throughSeq,
                      transcript: snapshot.transcript,
                    }),
                    Stream.fromIterable(details.replay),
                  ),
              })
              return Stream.concat(prefix, Stream.fromQueue(queue))
            }),
          ).pipe(Stream.scoped),
        interrupt: (sessionId) =>
          Ref.modify(state, (current): readonly [Option.Option<InterruptAction>, RegistryState] => {
            const session = current.sessions.get(sessionId)
            if (session === undefined) return [Option.none(), current]
            const [action, nextCoordination] = coordination.interruptRun(session.coordination)
            const sessions = new Map(current.sessions)
            sessions.set(sessionId, { ...session, coordination: nextCoordination })
            return [Option.some(action), { ...current, sessions }]
          }).pipe(
            Effect.flatMap((optional): Effect.Effect<void, SessionError> => {
              if (Option.isNone(optional)) return Effect.fail(sessionError(`Session ${sessionId} is not open`))
              const action = optional.value
              switch (action._tag) {
                case "Stop":
                  return stopRun(sessionId, action.runId, action.fiber)
                case "Requested":
                case "Ignore":
                  return Effect.void
              }
            }),
          ),
        info: (sessionId) => lookup(sessionId).pipe(Effect.flatMap(infoFrom)),
      })
    }),
  )
