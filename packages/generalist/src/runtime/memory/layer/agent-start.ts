import { Effect, Function, Option, Predicate, Schema, Stream } from "effect"
import { InvalidOutput } from "../../../core/agent/event.js"
import { encode as encodeAgentInput } from "../../../core/agent/lifecycle/input.js"
import { generateId } from "../../../core/model/telemetry/events.js"
import { origin as cursorOrigin } from "../../cursor.js"
import { RuntimeUnavailable, UnknownAgent } from "../../errors.js"
import { capture, type RegisteredAgents } from "../../executable/registered-agent.js"
import type { RunCancelled, RunEvent, RunFailed } from "../../run/event.js"
import type { Service as RunStore } from "../../run/store.js"
import { digest as steeringDigest } from "../../run/steering.js"
import type { RunId } from "../../../core/durable/run-id.js"
import type { Input as SteeringInput } from "../../../core/turn/steering.js"
import type {
  EventsError,
  Service as RuntimeService,
  StartEvent,
  StartExecutionError,
  StartExecutionInput,
  StartReceipt,
} from "../../service.js"
import { normalizePrompt } from "../prompt.js"
import { make as makeBudget } from "../../../core/durable/run-budget.js"

const decodeEvent = <OutputCodec extends Schema.Top>(schema: OutputCodec, event: RunEvent) => {
  if (event._tag !== "RunCompleted") return Effect.succeed<StartEvent<OutputCodec["Type"]>>(event)
  if ("_tag" in event.result) {
    return Effect.succeed<StartEvent<OutputCodec["Type"]>>({ ...event, result: event.result })
  }
  const encoded = Predicate.hasProperty(event.result, "output") ? event.result.output : event.result.text
  return Schema.decodeEffect(schema)(encoded).pipe(
    Effect.map((output) => ({ ...event, result: { ...event.result, output } })),
    Effect.mapError((error) => InvalidOutput.make({ issues: [error.message] })),
  )
}

const awaitOutput = <Output>(events: Stream.Stream<StartEvent<Output>, EventsError | InvalidOutput>) =>
  events.pipe(
    Stream.filter(
      (event) => event._tag === "RunCompleted" || event._tag === "RunFailed" || event._tag === "RunCancelled",
    ),
    Stream.runHead,
    Effect.flatMap((event): Effect.Effect<Output, EventsError | RunFailed | RunCancelled | InvalidOutput> => {
      if (Option.isNone(event)) {
        return Effect.fail(RuntimeUnavailable.make({ message: "Run event stream ended before a terminal event" }))
      }
      if (event.value._tag === "RunFailed" || event.value._tag === "RunCancelled") return Effect.fail(event.value)
      if (!("_tag" in event.value.result)) return Effect.succeed(event.value.result.output)
      return Effect.fail(InvalidOutput.make({ issues: ["Registered Agent completed with a Program result"] }))
    }),
  )

/** @internal Construct an untyped handle for a Run recovered by durable identity. */
const makeUntypedHandle = (store: RunStore, runId: RunId) => {
  const events = store.events({ runId, cursor: cursorOrigin }).pipe(
    Stream.mapEffect((event) => decodeEvent(Schema.Unknown, event)),
    Stream.takeUntil(
      (event) => event._tag === "RunCompleted" || event._tag === "RunFailed" || event._tag === "RunCancelled",
    ),
  )
  const steer = (input: SteeringInput) =>
    generateId.pipe(
      Effect.flatMap((idempotencyKey) => {
        const prompt = normalizePrompt(input.prompt)
        return store.admitSteering({ runId, idempotencyKey, prompt, digest: steeringDigest(prompt) })
      }),
    )
  return { runId, await: awaitOutput(events), events, steer, followUp: steer }
}
type UntypedHandle = ReturnType<typeof makeUntypedHandle>
export const untypedHandle: {
  (runId: RunId): (store: RunStore) => UntypedHandle
  (store: RunStore, runId: RunId): UntypedHandle
} = Function.dual(2, makeUntypedHandle)

/** @internal Construct typed Agent registration and start over one Runtime registry and store. */
export const make = (options: {
  readonly agents: RegisteredAgents
  readonly store: RunStore
  readonly admitStart: (
    input: StartExecutionInput,
    activate: boolean,
  ) => Effect.Effect<StartReceipt, StartExecutionError>
}) => {
  const register: RuntimeService["register"] = (agent) => capture(agent).pipe(Effect.flatMap(options.agents.register))
  const start: RuntimeService["start"] = (agent, input, startOptions) =>
    Effect.gen(function* () {
      const registration = yield* options.agents.getFor(agent)
      if (Option.isNone(registration)) {
        return yield* UnknownAgent.make({ name: agent.name, runId: `run_${yield* generateId}` })
      }
      const initialPrompt = yield* encodeAgentInput(agent.input, input).pipe(
        Effect.provideContext(registration.value.context),
      )
      const identity = yield* generateId
      const startKey = startOptions?.idempotencyKey ?? `start_${identity}`
      const sessionId =
        startOptions?.sessionId ??
        (startOptions?.idempotencyKey === undefined ? `session_${identity}` : `agent:${agent.name}`)
      const receipt = yield* options.admitStart(
        {
          executable: registration.value.executable,
          registrations: registration.value.registrations,
          sessionId,
          idempotencyKey: startKey,
          prompt: initialPrompt,
          budget: startOptions?.budget ?? makeBudget(agent.budget ?? {}),
        },
        true,
      )
      const steer = (steering: SteeringInput) =>
        generateId.pipe(
          Effect.flatMap((steeringKey) =>
            Effect.sync(() => normalizePrompt(steering.prompt)).pipe(
              Effect.flatMap((steeringPrompt) =>
                options.store.admitSteering({
                  runId: receipt.runId,
                  idempotencyKey: steeringKey,
                  prompt: steeringPrompt,
                  digest: steeringDigest(steeringPrompt),
                }),
              ),
            ),
          ),
        )
      const events = options.store.events({ runId: receipt.runId, cursor: cursorOrigin }).pipe(
        Stream.mapEffect((event) => decodeEvent(agent.output, event)),
        Stream.takeUntil(
          (event) => event._tag === "RunCompleted" || event._tag === "RunFailed" || event._tag === "RunCancelled",
        ),
        Stream.provideContext(registration.value.context),
      )
      return { runId: receipt.runId, await: awaitOutput(events), events, steer, followUp: steer }
    })
  return { register, start }
}
