import { Effect, Scope, Stream } from "effect"
import { dual } from "effect/Function"
import type { Tool } from "effect/unstable/ai"
import { generateId } from "../../model/telemetry/events.js"
import type { RunId } from "../../durable/run-id.js"
import {
  allocateRunInbox,
  type InboxFull,
  type Input as SteeringInput,
  type PolicyInvalid,
  type RunInbox,
  type RunClosed,
} from "../../turn/steering.js"
import { streamInternal } from "../run.js"
import type { Agent, RunError, RunOptions, RunRequirements } from "../service.js"
import { AgentError, type Event } from "../event.js"

/** @experimental Default prompt for the terminal structured-output turn. */
export const defaultObjectPrompt = "Return the final structured output for the task above."

/** @experimental Producer capability and event stream owned by one scoped Agent Run. */
export interface RunHandle<Tools extends Record<string, Tool.Any>, R, O extends RunOptions> {
  readonly runId: RunId
  readonly events: Stream.Stream<Event, RunError, RunRequirements<Tools, R, O>>
  readonly steer: (
    input: SteeringInput,
  ) => Effect.Effect<import("../../turn/steering.js").Receipt, InboxFull | RunClosed>
  readonly followUp: (
    input: SteeringInput,
  ) => Effect.Effect<import("../../turn/steering.js").Receipt, InboxFull | RunClosed>
}

/** @internal Allocate one scoped Run and its producer handle before consuming its event stream. */
export const allocateRun: {
  <O extends RunOptions>(
    options: O,
  ): <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent<Tools, R>,
  ) => Effect.Effect<RunHandle<Tools, R, O>, PolicyInvalid, Scope.Scope>
  <Tools extends Record<string, Tool.Any>, R, O extends RunOptions>(
    agent: Agent<Tools, R>,
    options: O,
  ): Effect.Effect<RunHandle<Tools, R, O>, PolicyInvalid, Scope.Scope>
} = dual(2, <Tools extends Record<string, Tool.Any>, R, O extends RunOptions>(agent: Agent<Tools, R>, options: O) =>
  Effect.gen(function* () {
    const runId: RunId = options.invocation === undefined ? `run_${yield* generateId}` : options.invocation.runId
    const { inbox, producer } = yield* allocateRunInbox(runId, options.steering ?? {})
    const structured =
      options.output === undefined
        ? undefined
        : {
            schema: options.output.schema,
            objectName: options.output.name ?? "output",
            objectPrompt: options.output.prompt ?? defaultObjectPrompt,
          }
    const start = inbox.start.pipe(
      Effect.flatMap((started) =>
        started
          ? Effect.void
          : AgentError.make({ message: `Agent Run ${runId} event stream was already consumed or closed`, turn: 0 }),
      ),
    )
    const events = Stream.unwrap(
      start.pipe(
        Effect.as(
          streamInternal(agent, options, structured, inbox).pipe(Stream.ensuring(inbox.close("execution-exit"))),
        ),
      ),
    )
    return { runId, events, ...producer }
  }),
)

/** @internal Execute one hosted Agent against its already-authoritative Run inbox. */
export const HostedRun = {
  stream: <Tools extends Record<string, Tool.Any>, R, O extends Omit<RunOptions, "output" | "steering">>(
    agent: Agent<Tools, R>,
    options: O,
    inbox: RunInbox,
  ) => streamInternal(agent, options, undefined, inbox),
}
