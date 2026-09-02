import { Effect, Schema, Scope, Stream } from "effect"
import { dual } from "effect/Function"
import { Prompt, type Tool } from "effect/unstable/ai"
import { generateId } from "../../model/telemetry/events.js"
import type { RunId } from "../../durable/run-id.js"
import { allocateRunInbox, type RunInbox } from "../../turn/steering-inbox.js"
import {
  RollbackRequiresRuntime,
  type AdmissionPolicy,
  type InboxFull,
  type Input as SteeringInput,
  type PolicyInvalid,
  type Receipt as SteeringReceipt,
  type RunBusy,
  type RunClosed,
} from "../../turn/steering.js"
import { streamInternal } from "../run.js"
import type { Agent, RunError, RunOptions, RunRequirements } from "../service.js"
import { AgentError, type Event, InvalidOutput } from "../event.js"
import { observe } from "../inspection/service.js"
import { requiredField, type StructuredRunConfig } from "../loop/context.js"

/** Default prompt for the terminal structured-output turn. */
export const defaultObjectPrompt = "Return the final structured output for the task above."

/** @internal Process-local admission state carried without widening the public producer methods. */
export const RunControlTypeId: unique symbol = Symbol.for("generalist/core/agent/RunControl")

/** Producer capability and event stream owned by one scoped Agent Run. */
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
  readonly [RunControlTypeId]: {
    readonly busy: Effect.Effect<boolean>
    readonly interruptTools: Effect.Effect<void>
    readonly reject: (
      input: SteeringInput,
    ) => Effect.Effect<ControlReceipt, ControlError | import("../../turn/steering.js").RunBusy>
  }
}

export type SendError = InboxFull | RunClosed | RollbackRequiresRuntime | RunBusy

const sendEffect = <EventValue, EventError, EventServices>(
  handle: RunHandle<EventValue, EventError, EventServices>,
  message: Prompt.Prompt | string,
  policy: AdmissionPolicy,
): Effect.Effect<SteeringReceipt, SendError> => {
  if (policy === "rollback") return Effect.fail(RollbackRequiresRuntime.make({ runId: handle.runId }))
  const input = { prompt: message }
  if (policy === "enqueue") return handle.followUp(input)
  if (policy === "interrupt") {
    return handle.steer(input).pipe(Effect.tap(() => handle[RunControlTypeId].interruptTools))
  }
  if (policy === "steer") return handle.steer(input)
  return handle[RunControlTypeId].reject(input)
}

/** Admit one message to a process-local Run under an explicit policy. */
export const send: {
  (
    message: Prompt.Prompt | string,
    policy: AdmissionPolicy,
  ): <EventValue, EventError, EventServices>(
    handle: RunHandle<EventValue, EventError, EventServices>,
  ) => Effect.Effect<SteeringReceipt, SendError>
  <EventValue, EventError, EventServices>(
    handle: RunHandle<EventValue, EventError, EventServices>,
    message: Prompt.Prompt | string,
    policy: AdmissionPolicy,
  ): Effect.Effect<SteeringReceipt, SendError>
} = dual(3, sendEffect)

type WrappedOutputCodec<OutputCodec extends Schema.Top> = Schema.Codec<
  { readonly output: OutputCodec["Type"] },
  { readonly output: OutputCodec["Encoded"] },
  OutputCodec["DecodingServices"],
  OutputCodec["EncodingServices"]
>

const structuredOutput = <OutputCodec extends Schema.Top>(agent: {
  readonly output: OutputCodec
}): StructuredRunConfig<WrappedOutputCodec<OutputCodec>, OutputCodec["Type"]> | undefined => {
  const outputSchema: Schema.Top = agent.output
  if (outputSchema === Schema.String) return undefined
  const schema = Schema.Struct({ output: requiredField(agent.output) })
  return {
    schema,
    objectName: "submit",
    objectPrompt: defaultObjectPrompt,
    output: (value: typeof schema.Type) => value.output,
  }
}

const decodeEvent = <OutputCodec extends Schema.Top>(
  schema: OutputCodec,
  event: Event,
): Effect.Effect<Event<OutputCodec["Type"]>, InvalidOutput> => {
  if (event._tag !== "Completed") return Effect.succeed(event)
  return Schema.decodeUnknownEffect(Schema.toType(schema))(event.output).pipe(
    Effect.map((output) => ({ ...event, output })),
    Effect.mapError((error) => InvalidOutput.make({ issues: [error.message] })),
  )
}

const typedEvents = <OutputCodec extends Schema.Top, E, R>(
  schema: OutputCodec,
  events: Stream.Stream<Event, E, R>,
): Stream.Stream<Event<OutputCodec["Type"]>, E | InvalidOutput, R> =>
  events.pipe(Stream.mapEffect((event) => decodeEvent(schema, event)))

/** @internal Allocate one scoped Run and its producer handle before consuming its event stream. */
export const allocateRun: {
  <O extends RunOptions>(
    options: O,
  ): <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices extends R,
    AuthorizationServices extends R,
    InputSchema extends Schema.Top,
    OutputSchema extends Schema.Top,
  >(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputSchema, OutputSchema>,
  ) => Effect.Effect<
    RunHandle<
      Event<OutputSchema["Type"]>,
      RunError,
      RunRequirements<Tools, R, O, typeof Schema.String, OutputSchema, PolicyServices, AuthorizationServices>
    >,
    PolicyInvalid,
    Scope.Scope
  >
  <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices extends R,
    AuthorizationServices extends R,
    InputSchema extends Schema.Top,
    OutputSchema extends Schema.Top,
    O extends RunOptions,
  >(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputSchema, OutputSchema>,
    options: O,
  ): Effect.Effect<
    RunHandle<
      Event<OutputSchema["Type"]>,
      RunError,
      RunRequirements<Tools, R, O, typeof Schema.String, OutputSchema, PolicyServices, AuthorizationServices>
    >,
    PolicyInvalid,
    Scope.Scope
  >
} = dual(
  2,
  <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices extends R,
    AuthorizationServices extends R,
    InputSchema extends Schema.Top,
    OutputSchema extends Schema.Top,
    O extends RunOptions,
  >(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputSchema, OutputSchema>,
    options: O,
  ) =>
    Effect.gen(function* () {
      const runId: RunId = options.invocation === undefined ? `run_${yield* generateId}` : options.invocation.runId
      const { inbox, producer, reject } = yield* allocateRunInbox(runId, options.steering ?? {})
      const structured = structuredOutput(agent)
      const start = inbox.start.pipe(
        Effect.flatMap((started) =>
          started
            ? Effect.void
            : AgentError.make({ message: `Agent Run ${runId} event stream was already consumed or closed`, turn: 0 }),
        ),
      )
      const events = typedEvents(
        agent.output,
        observe(
          runId,
          Stream.unwrap(
            start.pipe(
              Effect.as(
                streamInternal(agent, options, structured, inbox).pipe(Stream.ensuring(inbox.close("execution-exit"))),
              ),
            ),
          ),
        ),
      )
      return {
        runId,
        events,
        ...producer,
        [RunControlTypeId]: { busy: inbox.busy, interruptTools: inbox.interruptTools, reject },
      }
    }),
)

/** @internal Execute one hosted Agent against its already-authoritative Run inbox. */
export const HostedRun = {
  stream: <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices extends R,
    AuthorizationServices extends R,
    InputSchema extends Schema.Top,
    OutputSchema extends Schema.Top,
    O extends Omit<RunOptions, "steering">,
  >(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputSchema, OutputSchema>,
    options: O,
    inbox: RunInbox,
  ): Stream.Stream<
    Event<OutputSchema["Type"]>,
    RunError,
    | RunRequirements<Tools, R, O, typeof Schema.String, OutputSchema, PolicyServices, AuthorizationServices>
    | OutputSchema["DecodingServices"]
    | OutputSchema["EncodingServices"]
  > => typedEvents(agent.output, streamInternal(agent, options, structuredOutput(agent), inbox)),
}
