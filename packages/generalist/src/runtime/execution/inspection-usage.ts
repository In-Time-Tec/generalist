import { Effect, Equal, Option } from "effect"
import { cost as modelCost } from "../../ai/model-catalog.js"
import { RuntimeUnavailable } from "../errors.js"
import type { RunEvent } from "../run/event.js"
import type { RawUsageFact } from "../run.js"

const corruption = (message: string) => RuntimeUnavailable.make({ message })

type CallStarted = Extract<RunEvent, { readonly _tag: "ModelCallStarted" }>
type ModelAttemptTerminal = Extract<RunEvent, { readonly _tag: "ModelAttemptCompleted" | "ModelAttemptFailed" }>

interface FactProjection {
  readonly facts: Array<RawUsageFact>
  readonly attempts: Map<string, RawUsageFact>
  readonly attemptEvents: Map<string, RunEvent>
  readonly attemptMappings: Map<string, string>
}

interface RunFactProjection {
  readonly calls: Map<string, CallStarted>
  readonly callsWithAttempts: Set<string>
}

const recordModelCall = (
  runId: string,
  event: CallStarted,
  projection: RunFactProjection,
): Effect.Effect<void, RuntimeUnavailable> => {
  const key = `${runId}\u0000${event.modelCallId}`
  const previous = projection.calls.get(key)
  if (previous !== undefined && !Equal.equals(previous, event)) {
    return Effect.fail(corruption(`Conflicting model call ${event.modelCallId} in Run ${runId}`))
  }
  if (previous !== undefined && projection.callsWithAttempts.has(key)) {
    return Effect.fail(corruption(`Model call ${event.modelCallId} start replayed after an attempt terminal`))
  }
  projection.calls.set(key, event)
  return Effect.void
}

const usageFactFor = (runId: string, call: CallStarted, event: ModelAttemptTerminal): RawUsageFact | undefined => {
  const common = Object.assign(
    {
      runId,
      turn: event.turn,
      purpose: call.purpose,
      modelCallId: event.modelCallId,
      modelAttemptId: event.modelAttemptId,
      attempt: event.attempt,
    },
    call.provider === undefined ? undefined : { provider: call.provider },
    call.model === undefined ? undefined : { model: call.model },
  )
  if (event._tag === "ModelAttemptCompleted") {
    return {
      _tag: "Completed",
      ...common,
      usageAt: event.usageAt,
      usage: event.usage,
      ...Object.assign({}, event.requestId === undefined ? undefined : { requestId: event.requestId }),
      ...Object.assign({}, event.responseModel === undefined ? undefined : { responseModel: event.responseModel }),
      ...Object.assign({}, event.serviceTier === undefined ? undefined : { serviceTier: event.serviceTier }),
    }
  }
  return event.providerUsage === undefined
    ? undefined
    : {
        _tag: "Failed",
        ...common,
        category: event.category,
        usageAt: event.failedAt,
        providerUsage: event.providerUsage,
      }
}

const recordModelAttempt = (
  runId: string,
  event: ModelAttemptTerminal,
  projection: FactProjection,
  runProjection: RunFactProjection,
): Effect.Effect<void, RuntimeUnavailable> =>
  Effect.gen(function* () {
    const eventKey = `${runId}\u0000${event.modelAttemptId}`
    const previousEvent = projection.attemptEvents.get(eventKey)
    if (previousEvent !== undefined) {
      if (!Equal.equals(previousEvent, event))
        return yield* corruption(`Conflicting model attempt ${event.modelAttemptId}`)
      return
    }
    projection.attemptEvents.set(eventKey, event)
    const callKey = `${runId}\u0000${event.modelCallId}`
    const call = runProjection.calls.get(callKey)
    if (call === undefined)
      return yield* corruption(`Model attempt ${event.modelAttemptId} has no canonical call start`)
    if (call.turn !== event.turn)
      return yield* corruption(`Model attempt ${event.modelAttemptId} disagrees with its call turn`)
    runProjection.callsWithAttempts.add(callKey)
    const mappingKey = `${callKey}\u0000${event.attempt}`
    const mappedAttemptId = projection.attemptMappings.get(mappingKey)
    if (mappedAttemptId !== undefined && mappedAttemptId !== event.modelAttemptId) {
      return yield* corruption(
        `Model call ${event.modelCallId} attempt ${event.attempt} maps to conflicting attempt IDs`,
      )
    }
    projection.attemptMappings.set(mappingKey, event.modelAttemptId)
    const fact = usageFactFor(runId, call, event)
    if (fact === undefined) return
    const previous = projection.attempts.get(eventKey)
    if (previous !== undefined) {
      if (!Equal.equals(previous, fact)) return yield* corruption(`Conflicting model attempt ${event.modelAttemptId}`)
      return
    }
    projection.attempts.set(eventKey, fact)
    projection.facts.push(fact)
  })

export const factsForRuns = (
  runs: ReadonlyArray<{ readonly runId: string; readonly events: ReadonlyArray<RunEvent> }>,
): Effect.Effect<ReadonlyArray<RawUsageFact>, RuntimeUnavailable> =>
  Effect.gen(function* () {
    const projection: FactProjection = {
      facts: [],
      attempts: new Map(),
      attemptEvents: new Map(),
      attemptMappings: new Map(),
    }
    for (const run of runs) {
      const runProjection: RunFactProjection = { calls: new Map(), callsWithAttempts: new Set() }
      for (const event of run.events) {
        if (event._tag === "ModelCallStarted") {
          yield* recordModelCall(run.runId, event, runProjection)
          continue
        }
        if (event._tag !== "ModelAttemptCompleted" && event._tag !== "ModelAttemptFailed") continue
        yield* recordModelAttempt(run.runId, event, projection, runProjection)
      }
    }
    return projection.facts
  })

const factTokens = (fact: RawUsageFact): number => {
  if (fact._tag === "Failed") {
    return (
      fact.providerUsage.totalTokens ?? (fact.providerUsage.inputTokens ?? 0) + (fact.providerUsage.outputTokens ?? 0)
    )
  }
  return (fact.usage.inputTokens.total ?? 0) + (fact.usage.outputTokens.total ?? 0)
}

export const spendForUsage = Effect.fn("RuntimeInspection.spendForUsage")(function* (input: {
  readonly events: ReadonlyArray<RunEvent>
  readonly usage: ReadonlyArray<RawUsageFact>
}) {
  const { events, usage } = input
  const charges = usage.map((fact) => ({
    provider: fact.provider,
    model: fact.model,
    usage: fact._tag === "Completed" ? fact.usage : undefined,
  }))
  const chargedAttempts = new Set(usage.map((fact) => fact.modelAttemptId))
  const tokenCharges = new Map<string, number>()
  for (const fact of usage)
    tokenCharges.set(fact.modelCallId, (tokenCharges.get(fact.modelCallId) ?? 0) + factTokens(fact))
  const calls = new Map(
    events.flatMap((event) => (event._tag === "ModelCallStarted" ? [[event.modelCallId, event] as const] : [])),
  )
  for (const event of events) {
    if (event._tag !== "ModelResponseCommitted") continue
    tokenCharges.set(event.modelCallId, Math.max(tokenCharges.get(event.modelCallId) ?? 0, event.budgetCharge))
    if (chargedAttempts.has(event.modelAttemptId)) continue
    chargedAttempts.add(event.modelAttemptId)
    const call = calls.get(event.modelCallId)
    charges.push({
      provider: call?.provider,
      model: call?.model,
      usage: event.usage,
    })
  }
  let usd: number | "unknown" = 0
  for (const charge of charges) {
    if (charge.usage === undefined || charge.provider === undefined || charge.model === undefined) {
      usd = "unknown"
      continue
    }
    const priced = yield* modelCost({ provider: charge.provider, model: charge.model }, charge.usage)
    if (Option.isNone(priced)) usd = "unknown"
    else if (usd !== "unknown") usd += priced.value
  }
  return { tokens: [...tokenCharges.values()].reduce((total, tokens) => total + tokens, 0), usd }
})
