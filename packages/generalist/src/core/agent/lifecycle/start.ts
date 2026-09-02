import { Effect, Predicate, Schema, Stream } from "effect"
import { dual } from "effect/Function"
import type { Tool } from "effect/unstable/ai"
import type { ExecutableRegistration } from "../../../runtime/executable/registration.js"
import type { PinnedExecutable } from "../../../runtime/executable/manifest.js"
import {
  AgentExecutionResult,
  ProgramExecutionResult,
  type ProgramExecutionResult as ProgramExecutionResultValue,
} from "../../../runtime/execution/state.js"
import type { RunCompleted as RuntimeRunCompleted, RunEvent as RuntimeRunEvent } from "../../../runtime/run/event.js"
import type { SteeringReceipt } from "../../../runtime/run/steering.js"
import { Runtime, type EventsError, type StartError, type SteerError } from "../../../runtime/service.js"
import { generateId } from "../../model/telemetry/events.js"
import { AgentError, InvalidOutput } from "../event.js"
import type { Agent } from "../service.js"
import { AgentTypeId } from "../service.js"
import type { RunHandle } from "./run-handle.js"
import { encode as encodeInput } from "./input.js"

/**
 * @experimental Durable start parameters required until typed Agent registration lands.
 *
 * The Runtime must already have the exact closed Agent and its services registered for
 * `executable`; the in-memory Agent value supplies only the typed input/output contract.
 */
export interface StartOptions {
  readonly executable: PinnedExecutable
  readonly registrations: ReadonlyArray<ExecutableRegistration>
  readonly sessionId?: string
  readonly idempotencyKey?: string
}

type StartedAgentResult<OutputValue> = Omit<AgentExecutionResult, "output"> & { readonly output: OutputValue }

/** @experimental Durable Runtime event with an Agent completion decoded through its output Schema. */
export type StartEvent<OutputValue> =
  | Exclude<RuntimeRunEvent, RuntimeRunCompleted>
  | (Omit<RuntimeRunCompleted, "result"> & {
      readonly result: StartedAgentResult<OutputValue> | ProgramExecutionResultValue
    })

const decodeEvent = <OutputCodec extends Schema.Top>(
  schema: OutputCodec,
  event: RuntimeRunEvent,
): Effect.Effect<StartEvent<OutputCodec["Type"]>, InvalidOutput, OutputCodec["DecodingServices"]> => {
  if (event._tag !== "RunCompleted") return Effect.succeed(event)
  if (Schema.is(ProgramExecutionResult)(event.result)) return Effect.succeed(event)
  return Schema.decodeEffect(schema)(event.result.output ?? event.result.text).pipe(
    Effect.map((output) => ({ ...event, result: { ...event.result, output } })),
    Effect.mapError((error) => InvalidOutput.make({ issues: [error.message] })),
  )
}

interface StartFunction {
  <InputValue>(
    input: InputValue,
    options: StartOptions,
  ): <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices extends R,
    AuthorizationServices extends R,
    InputCodec extends Schema.Top,
    OutputCodec extends Schema.Top,
  >(
    agent: InputValue extends InputCodec["Type"]
      ? Agent<Tools, R, PolicyServices, AuthorizationServices, InputCodec, OutputCodec>
      : never,
  ) => Effect.Effect<
    RunHandle<StartEvent<OutputCodec["Type"]>, EventsError | InvalidOutput, never, SteeringReceipt, SteerError>,
    StartError | AgentError,
    Runtime | InputCodec["EncodingServices"] | OutputCodec["DecodingServices"]
  >
  <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices extends R,
    AuthorizationServices extends R,
    InputCodec extends Schema.Top,
    OutputCodec extends Schema.Top,
  >(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputCodec, OutputCodec>,
    input: InputCodec["Type"],
    options: StartOptions,
  ): Effect.Effect<
    RunHandle<StartEvent<OutputCodec["Type"]>, EventsError | InvalidOutput, never, SteeringReceipt, SteerError>,
    StartError | AgentError,
    Runtime | InputCodec["EncodingServices"] | OutputCodec["DecodingServices"]
  >
}

const isDataFirst = (args: IArguments): boolean => args.length >= 2 && Predicate.hasProperty(args[0], AgentTypeId)

/** @experimental Start a registered Agent through the durable Runtime. */
export const start: StartFunction = dual(
  isDataFirst,
  <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices extends R,
    AuthorizationServices extends R,
    InputCodec extends Schema.Top,
    OutputCodec extends Schema.Top,
  >(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputCodec, OutputCodec>,
    input: InputCodec["Type"],
    options: StartOptions,
  ) =>
    Effect.gen(function* () {
      const runtime = yield* Runtime
      const prompt = yield* encodeInput(agent.input, input)
      const outputContext = yield* Effect.context<OutputCodec["DecodingServices"]>()
      const identity = yield* generateId
      const receipt = yield* runtime.start({
        executable: options.executable,
        registrations: options.registrations,
        sessionId: options.sessionId ?? `session_${identity}`,
        idempotencyKey: options.idempotencyKey ?? `start_${identity}`,
        prompt,
      })
      const steer = (steering: import("../../turn/steering.js").Input) =>
        generateId.pipe(
          Effect.flatMap((idempotencyKey) =>
            runtime.steer({ runId: receipt.runId, idempotencyKey, prompt: steering.prompt }),
          ),
        )
      return {
        runId: receipt.runId,
        events: runtime.events({ runId: receipt.runId }).pipe(
          Stream.mapEffect((event) => decodeEvent(agent.output, event)),
          Stream.takeUntil(
            (event) => event._tag === "RunCompleted" || event._tag === "RunFailed" || event._tag === "RunCancelled",
          ),
          Stream.provideContext(outputContext),
        ),
        steer,
        // The durable Runtime currently has one steering lane. #318 may add a distinct follow-up contract.
        followUp: steer,
      }
    }),
)
