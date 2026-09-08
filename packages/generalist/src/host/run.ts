import { Duration, Effect, Schema, type Types } from "effect"
import { awaitEvent, AwaitEventResult, WakeEventFilter } from "../core/agent/tools/wake-event.js"
import { ToolContext } from "../core/tools/tool-context.js"
import { ActionableTaggedError, errorHint } from "../core/error-hint.js"
import type { Prompt } from "effect/unstable/ai"
import type { RunHandle, Service, SpawnInput, SpawnError, InspectError } from "../runtime/service.js"
import type { SessionError, HostSession } from "../runtime/session/host.js"
import type { SessionHandle } from "./session.js"

export interface ChildSpawnOptions {
  readonly commandId: string
  readonly label?: string
}
export interface ChildHandle {
  readonly session: SessionHandle
  readonly run: HostRun<unknown>
}
export interface WaitOptions {
  readonly runs?: ReadonlyArray<string>
  readonly messages?: boolean
  readonly commandId: string
  readonly timeout?: Duration.Input
}
export class WaitInvalid extends ActionableTaggedError<WaitInvalid>()("generalist/host/WaitInvalid", {
  message: Schema.String,
  hint: errorHint("Wait from the active Agent tool context with a bounded selector and stable command identity."),
}) {}
export const WaitResult = AwaitEventResult
export type WaitResult = typeof WaitResult.Type
export type HostRun<Output> = Omit<RunHandle<Output>, "runId"> & {
  readonly id: RunHandle<Output>["runId"]
  readonly wait: (
    options: WaitOptions,
  ) => Effect.Effect<
    WaitResult,
    WaitInvalid | import("../core/agent/tools/wake-event.js").AwaitEventInvalid,
    ToolContext
  >
  readonly spawn: (
    selection: string,
    prompt: Prompt.Prompt | string,
    options: ChildSpawnOptions,
  ) => Effect.Effect<
    ChildHandle,
    SpawnError | InspectError | SessionError | import("../runtime/service.js").GetRunError
  >
}

export const make = ({
  runtime,
  sessionHandle,
}: {
  readonly runtime: Service
  readonly sessionHandle: (session: HostSession) => SessionHandle
}) => {
  const hostRun = <Output>(handle: RunHandle<Output>): HostRun<Output> => ({
    id: handle.runId,
    await: handle.await,
    events: handle.events,
    send: handle.send,
    wait: (options) =>
      Effect.gen(function* () {
        const context = yield* ToolContext
        if (context.runId !== handle.runId)
          return yield* WaitInvalid.make({
            message: "A model-facing wait must belong to the currently executing Agent Run.",
          })
        const filter = yield* Schema.decodeEffect(WakeEventFilter)({
          _tag: "Run",
          runs: options.runs ?? [],
          messages: options.messages ?? false,
          commandId: options.commandId,
        }).pipe(Effect.mapError((error) => WaitInvalid.make({ message: error.message })))
        if ((options.runs?.length ?? 0) === 0 && options.messages !== true)
          return yield* WaitInvalid.make({ message: "Select at least one Run or incoming messages." })
        return yield* awaitEvent(filter, { timeout: options.timeout ?? Duration.minutes(5) })
      }),
    spawn: (selection, prompt, options) =>
      Effect.gen(function* () {
        const input: Types.Mutable<SpawnInput> = {
          parentRunId: handle.runId,
          invocationId: options.commandId,
          selection,
          prompt,
        }
        if (options.label !== undefined) input.label = options.label
        const receipt = yield* runtime.spawn(input)
        const inspection = yield* runtime.inspect(receipt.runId)
        if (inspection.retainedSession === undefined)
          return yield* Effect.die("An admitted child must have a canonical retained Session")
        const session = sessionHandle(yield* runtime.session(inspection.retainedSession.id))
        return { session, run: hostRun(yield* runtime.getRun(receipt.runId)) }
      }),
  })
  return hostRun
}
