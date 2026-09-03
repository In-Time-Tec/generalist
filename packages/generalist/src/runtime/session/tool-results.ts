import { operationKey } from "../../core/durable/driver.js"
import { digest as pinDigest } from "../../core/durable/pin.js"
import { buildContext, type Entry, unresolvedToolCalls } from "../../core/context/session.js"
import { Effect, Schema } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import { promptFromResponseParts } from "../../media/prompt.js"
import { RuntimeUnavailable } from "../errors.js"
import { RunFailure, type RunEvent } from "../run/event.js"

export type RunTerminalOutcome =
  | { readonly _tag: "RunCancelled"; readonly reason?: string }
  | { readonly _tag: "RunFailed"; readonly error: RunFailure }
  | { readonly _tag: "RunCompleted" }

export interface ToolOperation {
  readonly operationId: string
  readonly operationKey: string
  readonly kind: string
  readonly status: "requested" | "running" | "cancelling" | "cancelled" | "succeeded" | "failed" | "unknown"
  readonly input: unknown
  readonly result?: unknown
  readonly error?: unknown
}

const SuccessfulOperationResult = Schema.TaggedStruct("Success", {
  encodedResult: Schema.optionalKey(Schema.Unknown),
  result: Schema.optionalKey(Schema.Unknown),
})
const FailedOperationResult = Schema.TaggedStruct("DomainFailure", {
  encodedFailure: Schema.optionalKey(Schema.Unknown),
  failure: Schema.optionalKey(Schema.Unknown),
})
const ToolOperationResult = Schema.Union([SuccessfulOperationResult, FailedOperationResult])

type TerminalFailure =
  | { readonly _tag: "Cancelled"; readonly reason: string }
  | { readonly _tag: "Failed"; readonly error: typeof RunFailure.Encoded }

type ModelResponseEvent = Extract<RunEvent, { readonly _tag: "ModelResponseCommitted" | "ModelResponseInterrupted" }>
type ToolCompletedEvent = Extract<RunEvent, { readonly _tag: "ToolExecutionCompleted" }>

interface OwnedCall {
  readonly call: Prompt.ToolCallPart
  readonly response: ModelResponseEvent
  readonly operation?: ToolOperation
}

const unavailable = (message: string) => RuntimeUnavailable.make({ message })

const resultPart = (
  call: { readonly id: string; readonly name: string },
  input: { readonly isFailure: boolean; readonly result: unknown },
): Prompt.ToolResultPart =>
  Prompt.makePart("tool-result", {
    id: call.id,
    name: call.name,
    isFailure: input.isFailure,
    result: input.result,
    providerExecuted: false,
  })

const terminalFailure = (terminal: Exclude<RunTerminalOutcome, { readonly _tag: "RunCompleted" }>): TerminalFailure =>
  terminal._tag === "RunCancelled"
    ? { _tag: "Cancelled", reason: terminal.reason ?? "Run cancelled" }
    : { _tag: "Failed", error: Schema.encodeSync(RunFailure)(terminal.error) }

const completedResultPart = (call: Prompt.ToolCallPart, completed: ToolCompletedEvent): Prompt.ToolResultPart =>
  resultPart(call, {
    isFailure: completed.result.isFailure,
    result: completed.result.encodedResult,
  })

const outcomePart = (
  call: Prompt.ToolCallPart,
  operation: ToolOperation | undefined,
  completed: ToolCompletedEvent | undefined,
  terminal: Exclude<RunTerminalOutcome, { readonly _tag: "RunCompleted" }>,
): Prompt.ToolResultPart => {
  if (completed !== undefined) return completedResultPart(call, completed)
  if (operation?.status === "succeeded" && Schema.is(ToolOperationResult)(operation.result)) {
    const outcome = operation.result
    if (outcome._tag === "Success") {
      return resultPart(call, {
        isFailure: false,
        result: outcome.encodedResult === undefined ? outcome.result : outcome.encodedResult,
      })
    }
    if (outcome._tag === "DomainFailure") {
      return resultPart(call, {
        isFailure: true,
        result: outcome.encodedFailure === undefined ? outcome.failure : outcome.encodedFailure,
      })
    }
  }
  if (operation?.status === "failed") {
    return resultPart(call, { isFailure: true, result: operation.error })
  }
  if (operation?.status === "running" || operation?.status === "unknown") {
    const unknown = { _tag: "Unknown", operationId: operation.operationId }
    return resultPart(call, { isFailure: true, result: unknown })
  }
  const failure = terminalFailure(terminal)
  return resultPart(call, { isFailure: true, result: failure })
}

const callIdentity = (call: { readonly id: string; readonly name: string }) => `${call.id}\u0000${call.name}`

const entryDigest = (
  entry: Entry,
): { readonly tag: ModelResponseEvent["_tag"]; readonly value: string } | undefined => {
  if (entry._tag !== "ModelResponse") return undefined
  const completed = Schema.decodeUnknownOption(Schema.String)(entry.metadata?.modelResponseDigest)
  if (completed._tag === "Some") return { tag: "ModelResponseCommitted", value: completed.value }
  const interrupted = Schema.decodeUnknownOption(Schema.String)(entry.metadata?.interruptionDigest)
  if (interrupted._tag === "Some") return { tag: "ModelResponseInterrupted", value: interrupted.value }
  return undefined
}

const assistantMessage = (entry: Entry): Prompt.Message | undefined => {
  if (entry._tag === "ModelResponse") {
    return promptFromResponseParts(entry.content).content.find((candidate) => candidate.role === "assistant")
  }
  return entry._tag === "Message" && entry.message.role === "assistant" ? entry.message : undefined
}

const resolveOwnedCall = (
  calls: ReadonlyMap<string, ReadonlyArray<OwnedCall>>,
  call: Prompt.ToolCallPart,
): Effect.Effect<OwnedCall, RuntimeUnavailable> => {
  const matching = calls.get(callIdentity(call)) ?? []
  if (matching.length === 0) {
    return Effect.fail(unavailable(`Tool call ${call.id} has no durable model response ownership`))
  }
  if (matching.length === 1 && matching[0] !== undefined) return Effect.succeed(matching[0])
  return Effect.fail(unavailable(`Tool call ${call.id} has ambiguous model response ownership`))
}

const ownedCalls = (input: {
  readonly runId: string
  readonly path: ReadonlyArray<Entry>
  readonly events: ReadonlyArray<RunEvent>
  readonly operations: ReadonlyArray<ToolOperation>
}): Effect.Effect<ReadonlyArray<OwnedCall>, RuntimeUnavailable> =>
  Effect.gen(function* () {
    const responseEvents = input.events.filter(
      (event): event is ModelResponseEvent =>
        event._tag === "ModelResponseCommitted" || event._tag === "ModelResponseInterrupted",
    )
    const operations = new Map(
      input.operations
        .filter((operation) => operation.kind === "tool")
        .map((operation) => [operation.operationKey, operation]),
    )
    const calls = new Map<string, Array<OwnedCall>>()
    for (const entry of input.path) {
      const message = assistantMessage(entry)
      if (message === undefined || Schema.is(Schema.String)(message.content)) continue
      const digest = entryDigest(entry)
      if (digest === undefined) continue
      const matching = responseEvents.filter((event) => event._tag === digest.tag && event.digest === digest.value)
      if (matching.length === 0) continue
      if (matching.length !== 1) {
        return yield* unavailable(`Session entry ${entry.id} matches multiple model response events`)
      }
      const response = matching[0]!
      if (response.sessionEntryId !== entry.id) {
        return yield* unavailable(`Session entry ${entry.id} diverges from model response ${response.eventId}`)
      }
      const responseContent: ReadonlyArray<Response.AnyPart> = entry._tag === "ModelResponse" ? entry.content : []
      for (const call of message.content) {
        if (call.type !== "tool-call" || call.providerExecuted === true) continue
        const committed = responseContent.some(
          (part) =>
            part.type === "tool-call" &&
            part.providerExecuted !== true &&
            part.id === call.id &&
            part.name === call.name,
        )
        if (!committed) {
          return yield* unavailable(`Session entry ${entry.id} diverges from model response ${response.eventId}`)
        }
        const key = operationKey([input.runId, "tool", response.turn, call.id, call.name])
        const operation = operations.get(key)
        const owned: OwnedCall = operation === undefined ? { call, response } : { call, response, operation }
        const identity = callIdentity(call)
        calls.set(identity, [...(calls.get(identity) ?? []), owned])
      }
    }
    const unresolved = unresolvedToolCalls(buildContext(input.path))
    return yield* Effect.forEach(unresolved, (call) => resolveOwnedCall(calls, call))
  })

const completedToolResult = (
  events: ReadonlyArray<RunEvent>,
  owned: OwnedCall,
): Effect.Effect<ToolCompletedEvent | undefined, RuntimeUnavailable> => {
  const matching = events.filter(
    (event): event is ToolCompletedEvent =>
      event._tag === "ToolExecutionCompleted" &&
      event.sequence > owned.response.sequence &&
      event.turn === owned.response.turn &&
      event.call.id === owned.call.id &&
      event.call.name === owned.call.name,
  )
  const outcomes = new Set(
    matching.map((event) =>
      pinDigest({
        id: event.result.id,
        name: event.result.name,
        isFailure: event.result.isFailure,
        encodedResult: event.result.encodedResult,
      }),
    ),
  )
  return outcomes.size <= 1
    ? Effect.succeed(matching.at(-1))
    : Effect.fail(unavailable(`Tool call ${owned.call.id} has conflicting completed outcomes`))
}

export const terminalToolMessage = (input: {
  readonly runId: string
  readonly path: ReadonlyArray<Entry>
  readonly events: ReadonlyArray<RunEvent>
  readonly operations: ReadonlyArray<ToolOperation>
  readonly terminal: RunTerminalOutcome
}): Effect.Effect<Prompt.ToolMessage | undefined, RuntimeUnavailable> =>
  Effect.gen(function* () {
    const unresolved = yield* ownedCalls(input)
    if (unresolved.length === 0) return undefined
    if (input.terminal._tag === "RunCompleted") {
      return yield* unavailable(
        `Run ${input.runId} cannot complete with unresolved tool calls: ${unresolved
          .map(({ call }) => call.id)
          .join(", ")}`,
      )
    }
    const terminal: Exclude<RunTerminalOutcome, { readonly _tag: "RunCompleted" }> = input.terminal
    const content = yield* Effect.forEach(unresolved, (owned) =>
      completedToolResult(input.events, owned).pipe(
        Effect.map((completed) => outcomePart(owned.call, owned.operation, completed, terminal)),
      ),
    )
    return Prompt.makeMessage("tool", { content })
  })
