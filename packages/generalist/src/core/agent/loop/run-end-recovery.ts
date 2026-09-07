import { Effect, Schema } from "effect"
import { runEnd as runEndInput } from "../../../hooks/input.js"
import { checkpoint as driverCheckpoint } from "../../durable/driver/run.js"
import { LoopDriverState } from "../../durable/loop-driver-state.js"
import { DriverStateInvalid } from "../../durable/service.js"
import type { Event } from "../event.js"

export const resume = Effect.fn("Agent.resumeRunEnd")(function* <RD, RE>(options: {
  readonly outputSchema: Schema.Codec<unknown, unknown, RD, RE>
  readonly turnStart: number | undefined
}) {
  const checkpoint = yield* driverCheckpoint
  const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(checkpoint.state).pipe(
    Effect.mapError((error) => DriverStateInvalid.make({ message: String(error) })),
  )
  const pending = state.pending
  if (pending?.kind !== "hook" || !Schema.is(Schema.Struct({ event: Schema.Literal("RunEnd") }))(pending.input)) {
    return undefined
  }
  if (
    options.turnStart !== undefined &&
    options.turnStart > checkpoint.turn &&
    state.hooks?.some((hook) => hook.key === "hook:run:end" && hook.event === "RunEnd" && hook.complete) === true
  ) {
    return undefined
  }
  const recorded = yield* Schema.decodeUnknownEffect(
    Schema.Struct({ input: Schema.toCodecJson(runEndInput(options.outputSchema)) }),
  )(pending.input).pipe(Effect.mapError((error) => DriverStateInvalid.make({ message: String(error) })))
  return {
    _tag: "Completed",
    turns: recorded.input.turns,
    text: recorded.input.text,
    output: recorded.input.output,
    transcript: recorded.input.transcript,
  } satisfies Event
})
