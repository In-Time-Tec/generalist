import { Effect, type Types } from "effect"
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
export type HostRun<Output> = Omit<RunHandle<Output>, "runId"> & {
  readonly id: RunHandle<Output>["runId"]
  readonly spawn: (
    selection: string,
    prompt: Prompt.Prompt | string,
    options: ChildSpawnOptions,
  ) => Effect.Effect<ChildHandle, SpawnError | InspectError | SessionError>
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
