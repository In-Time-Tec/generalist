import { Effect, Schema, Stream } from "effect"
import type { Prompt } from "effect/unstable/ai"
import { generateId } from "../../model/telemetry/events.js"
import { allocateRunInbox, type RunInbox } from "../../turn/steering-inbox.js"
import type { Event } from "../event.js"
import type { RunError } from "../run/error.js"
import type { RunOptions } from "../service.js"
import { requiredField, type StructuredRunConfig } from "../loop/context.js"
import { VerifierOutput, type VerifierAgent } from "./definition.js"
import type { VerifierRunner } from "./evaluation.js"

const schema = Schema.Struct({ output: requiredField(VerifierOutput) })
const structured: StructuredRunConfig<typeof schema, VerifierOutput> = {
  schema,
  objectName: "submit",
  objectPrompt: "Return the final structured output for the task above.",
  output: (value) => value.output,
}

export interface InternalRun {
  <R>(
    agent: VerifierAgent<R>,
    options: RunOptions,
    structured: StructuredRunConfig<typeof schema, VerifierOutput>,
    inbox: RunInbox,
  ): Stream.Stream<Event, RunError, R>
}

/** Build the fresh verifier runner around the owning recursive Agent loop. */
export const make = (run: InternalRun): VerifierRunner =>
  function <R>(agent: VerifierAgent<R>, prompt: Prompt.Prompt) {
    return Effect.scoped(
      Effect.gen(function* () {
        const runId = `run_${yield* generateId}`
        const { inbox } = yield* allocateRunInbox(runId, {})
        const events = Array.from(
          yield* run(agent, { prompt }, structured, inbox).pipe(
            Stream.ensuring(inbox.close("execution-exit")),
            Stream.runCollect,
          ),
        )
        return { runId, events }
      }),
    )
  }
