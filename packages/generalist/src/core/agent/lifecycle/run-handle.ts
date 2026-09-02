import { Effect, Schema, Scope, Stream } from "effect"
import { dual } from "effect/Function"
import type { Tool } from "effect/unstable/ai"
import { generateId } from "../../model/telemetry/events.js"
import type { RunId } from "../../durable/run-id.js"
import { allocateRunInbox, type RunInbox } from "../../turn/steering-inbox.js"
import type { InboxFull, Input as SteeringInput, PolicyInvalid, RunClosed } from "../../turn/steering.js"
import { streamInternal } from "../run.js"
import type { Agent, RunError, RunOptions, RunRequirements } from "../service.js"
import { AgentError, type Event } from "../event.js"

/** @experimental Default prompt for the terminal structured-output turn. */
export const defaultObjectPrompt = "Return the final structured output for the task above."

/** @experimental Producer capability and event stream owned by one scoped Agent Run. */
export interface RunHandle<
  EventValue = Event,
  EventError = RunError,
  EventServices = never,
  ControlReceipt = import("../../turn/steering.js").Receipt,
  ControlError = InboxFull | RunClosed,
> {
  readonly runId: RunId
  readonly events: Stream.Stream<EventValue, EventError, EventServices>
  readonly steer: (input: SteeringInput) => Effect.Effect<ControlReceipt, ControlError>
  readonly followUp: (input: SteeringInput) => Effect.Effect<ControlReceipt, ControlError>
}

const structuredOutput = (agent: Agent<any, any>) => {
  if (agent.output === Schema.String) return undefined
  const schema = Schema.Struct({ output: agent.output })
  return {
    schema,
    objectName: "submit",
    objectPrompt: defaultObjectPrompt,
    output: (value: typeof schema.Type) => value.output,
  }
}

/** @internal Allocate one scoped Run and its producer handle before consuming its event stream. */
export const allocateRun: {
  <O extends RunOptions>(
    options: O,
  ): <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices,
    AuthorizationServices,
    InputSchema extends Schema.Top,
    OutputSchema extends Schema.Top,
  >(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputSchema, OutputSchema>,
  ) => Effect.Effect<
    RunHandle<Event<OutputSchema["Type"]>, RunError, RunRequirements<Tools, R, O>>,
    PolicyInvalid,
    Scope.Scope
  >
  <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices,
    AuthorizationServices,
    InputSchema extends Schema.Top,
    OutputSchema extends Schema.Top,
    O extends RunOptions,
  >(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputSchema, OutputSchema>,
    options: O,
  ): Effect.Effect<
    RunHandle<Event<OutputSchema["Type"]>, RunError, RunRequirements<Tools, R, O>>,
    PolicyInvalid,
    Scope.Scope
  >
} = dual(
  2,
  <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices,
    AuthorizationServices,
    InputSchema extends Schema.Top,
    OutputSchema extends Schema.Top,
    O extends RunOptions,
  >(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputSchema, OutputSchema>,
    options: O,
  ) =>
    Effect.gen(function* () {
      const runId: RunId = options.invocation === undefined ? `run_${yield* generateId}` : options.invocation.runId
      const { inbox, producer } = yield* allocateRunInbox(runId, options.steering ?? {})
      const structured = structuredOutput(agent)
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
            streamInternal(agent as unknown as Agent<Tools, R>, options, structured, inbox).pipe(
              Stream.ensuring(inbox.close("execution-exit")),
            ),
          ),
        ),
      ) as Stream.Stream<Event<OutputSchema["Type"]>, RunError, RunRequirements<Tools, R, O>>
      return { runId, events, ...producer }
    }),
)

/** @internal Execute one hosted Agent against its already-authoritative Run inbox. */
export const HostedRun = {
  stream: <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices,
    AuthorizationServices,
    InputSchema extends Schema.Top,
    OutputSchema extends Schema.Top,
    O extends Omit<RunOptions, "steering">,
  >(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputSchema, OutputSchema>,
    options: O,
    inbox: RunInbox,
  ): Stream.Stream<Event<OutputSchema["Type"]>, RunError, RunRequirements<Tools, R, O>> =>
    streamInternal(agent as unknown as Agent<Tools, R>, options, structuredOutput(agent), inbox) as Stream.Stream<
      Event<OutputSchema["Type"]>,
      RunError,
      RunRequirements<Tools, R, O>
    >,
}
