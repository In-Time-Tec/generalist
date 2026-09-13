import { Effect, Types } from "effect"
import { Prompt } from "effect/unstable/ai"
import type { Any as AnyAgent } from "../core/agent/service.js"
import type { HostSession, SessionError } from "../runtime/session/host.js"
import type { Service as RuntimeService } from "../runtime/engine.js"
import { PayloadTooLarge, type RuntimeLifecycleError, UnknownAgent } from "../runtime/errors.js"
import { SessionQueueConflict, type PendingInput, type QueueReceipt } from "../runtime/session/queue.js"
import { AgentNotRegistered } from "./errors.js"
import { generateId } from "../core/model/telemetry/events.js"
import { SessionSender } from "../runtime/session/message.js"

export interface QueueCommandOptions {
  readonly commandId: string
}
export interface SessionCreateOptions {
  readonly id?: string
  readonly title?: string
  readonly agent?: string
}
export interface QueueEditOptions extends QueueCommandOptions {
  readonly expectedRevision: number
  readonly agent?: string
}
export type QueueError =
  | SessionError
  | RuntimeLifecycleError
  | SessionQueueConflict
  | AgentNotRegistered
  | UnknownAgent
  | PayloadTooLarge
export type SessionControlError = SessionError | RuntimeLifecycleError

export const create =
  ({
    runtime,
    registeredByName,
  }: {
    readonly runtime: RuntimeService
    readonly registeredByName: ReadonlyMap<string, AnyAgent>
  }) =>
  (options: SessionCreateOptions = {}) =>
    Effect.gen(function* () {
      const request: Types.Mutable<import("../runtime/session/host.js").CreateSessionInput> = {
        id: options.id ?? `session_${yield* generateId}`,
      }
      if (options.title !== undefined) request.title = options.title
      if (options.agent !== undefined) {
        if (!registeredByName.has(options.agent)) return yield* AgentNotRegistered.make({ name: options.agent })
        request.selection = yield* runtime.sessionSelection(options.agent)
      }
      return make({ runtime, registeredByName })(yield* runtime.createSession(request))
    })
export interface SessionHandle extends Omit<HostSession, "queue"> {
  readonly message: (
    input: Prompt.Prompt | string,
    options: QueueCommandOptions,
  ) => Effect.Effect<QueueReceipt, QueueError, SessionSender>
  readonly stop: (options: QueueCommandOptions) => Effect.Effect<void, SessionControlError>
  readonly close: (options: QueueCommandOptions) => Effect.Effect<void, SessionControlError>
  readonly resume: (options: QueueCommandOptions) => Effect.Effect<void, SessionControlError>
  readonly inspect: Effect.Effect<HostSession, SessionError>
  readonly submit: (
    input: Prompt.Prompt | string,
    options: QueueCommandOptions,
  ) => Effect.Effect<QueueReceipt, QueueError>
  readonly snapshot: Effect.Effect<
    import("../runtime/session/host.js").HostSessionSnapshot,
    import("../runtime/session/host.js").SessionSnapshotError
  >
  readonly queue: {
    readonly list: () => Effect.Effect<ReadonlyArray<PendingInput>, SessionError>
    readonly update: (
      id: string,
      input: Prompt.Prompt | string,
      options: QueueEditOptions,
    ) => Effect.Effect<QueueReceipt, QueueError>
    readonly remove: (id: string, options: Omit<QueueEditOptions, "agent">) => Effect.Effect<QueueReceipt, QueueError>
  }
}

export const make =
  ({
    runtime,
    registeredByName,
  }: {
    readonly runtime: RuntimeService
    readonly registeredByName: ReadonlyMap<string, AnyAgent>
  }) =>
  (session: HostSession): SessionHandle => ({
    ...session,
    message: (input, options) =>
      Effect.suspend(() =>
        runtime.messageSessionInput({
          sessionId: session.id,
          commandId: options.commandId,
          prompt: Prompt.make(input),
        }),
      ),
    stop: (options) => runtime.controlSession({ sessionId: session.id, commandId: options.commandId, action: "stop" }),
    close: (options) =>
      runtime.controlSession({ sessionId: session.id, commandId: options.commandId, action: "close" }),
    resume: (options) =>
      runtime.controlSession({ sessionId: session.id, commandId: options.commandId, action: "resume" }),
    inspect: runtime.session(session.id),
    snapshot: runtime.sessionSnapshot(session.id),
    submit: (input, options) =>
      Effect.gen(function* () {
        const prompt = Prompt.make(input)
        return yield* runtime.submitSessionInput({ sessionId: session.id, commandId: options.commandId, prompt })
      }),
    queue: {
      list: () => runtime.session(session.id).pipe(Effect.map((current) => current.queue)),
      update: (id, input, options) =>
        Effect.gen(function* () {
          const prompt = Prompt.make(input)
          const request: Types.Mutable<import("../runtime/session/queue.js").UpdateInput> = {
            sessionId: session.id,
            commandId: options.commandId,
            id,
            expectedRevision: options.expectedRevision,
            prompt,
          }
          if (options.agent !== undefined) request.agent = options.agent
          return yield* runtime
            .updateSessionInput(request, (name) =>
              registeredByName.has(name)
                ? runtime.sessionSelection(name)
                : Effect.fail(UnknownAgent.make({ agentName: name, runId: "session-selection" })),
            )
            .pipe(
              Effect.catchTag("generalist/runtime/UnknownAgent", (error) =>
                AgentNotRegistered.make({ name: error.agentName }),
              ),
            )
        }),
      remove: (id, options) =>
        runtime.removeSessionInput({
          sessionId: session.id,
          commandId: options.commandId,
          id,
          expectedRevision: options.expectedRevision,
        }),
    },
  })
