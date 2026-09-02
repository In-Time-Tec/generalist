import { DateTime, Effect, Option, Schema } from "effect"
import type { RawUsageFact } from "../../run.js"
import { AgentLoopEventSchema, type RunEvent } from "../../run/event.js"
import type { RuntimeInspection } from "../../service.js"
import { isInspectionEvent, type InspectionEvent } from "./event.js"

const usageFor = (facts: ReadonlyArray<RawUsageFact>) => {
  let inputTokens = 0
  let outputTokens = 0
  for (const fact of facts) {
    if (fact._tag === "Completed") {
      inputTokens += fact.usage.inputTokens.total ?? fact.usage.inputTokens.uncached ?? 0
      outputTokens += fact.usage.outputTokens.total ?? 0
    } else {
      inputTokens += fact.providerUsage.inputTokens ?? 0
      outputTokens += fact.providerUsage.outputTokens ?? 0
    }
  }
  return { inputTokens, outputTokens }
}

const isLastEvent = (event: RunEvent): event is RunEvent & InspectionEvent =>
  Schema.is(AgentLoopEventSchema)(event) && isInspectionEvent(event)

const elapsedFor = (events: ReadonlyArray<RunEvent>) =>
  Effect.gen(function* () {
    const accepted = events.find((event) => event._tag === "RunAccepted")
    const startedAt = accepted === undefined ? Option.none() : DateTime.make(accepted.occurredAt)
    if (Option.isNone(startedAt)) return 0
    return Math.max(0, DateTime.toEpochMillis(yield* DateTime.now) - DateTime.toEpochMillis(startedAt.value))
  })

/** Project the process-local Inspector fields that have authoritative durable journal equivalents. */
export const fieldsForEvents = (
  usageFacts: ReadonlyArray<RawUsageFact>,
): ((
  events: ReadonlyArray<RunEvent>,
) => Effect.Effect<Pick<RuntimeInspection, "usage" | "usageFacts" | "activeTools" | "lastEvent" | "elapsed">>) =>
  Effect.fn("RuntimeInspection.fieldsForEvents")(function* (events) {
    const active = new Map<string, string>()
    for (const event of events) {
      if (event._tag === "ToolExecutionStarted") active.set(event.call.id, event.call.name)
      if (event._tag === "ToolExecutionCompleted" || event._tag === "ToolExecutionWaiting") active.delete(event.call.id)
    }
    const fields = {
      usage: usageFor(usageFacts),
      usageFacts,
      activeTools: [...active.values()],
      elapsed: yield* elapsedFor(events),
    }
    const lastEvent = events.findLast(isLastEvent)
    return lastEvent === undefined ? fields : { ...fields, lastEvent }
  })
