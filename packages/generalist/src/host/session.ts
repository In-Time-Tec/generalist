import { Effect, Types } from "effect"
import { Prompt } from "effect/unstable/ai"
import type { Any as AnyAgent } from "../core/agent/service.js"
import type { HostSession, SessionError } from "../runtime/session/host.js"
import type { Service as RuntimeService } from "../runtime/service.js"
import { UnknownAgent } from "../runtime/errors.js"
import { SessionQueueConflict, type PendingInput, type QueueReceipt } from "../runtime/session/queue.js"
import { AgentNotRegistered } from "./errors.js"

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
export type QueueError = SessionError | SessionQueueConflict | AgentNotRegistered | UnknownAgent
export interface SessionHandle extends Omit<HostSession, "queue"> {
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
                : Effect.fail(UnknownAgent.make({ name, runId: "session-selection" })),
            )
            .pipe(
              Effect.catchTag("generalist/runtime/UnknownAgent", (error) =>
                AgentNotRegistered.make({ name: error.name }),
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
