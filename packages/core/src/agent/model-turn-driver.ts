import { Cause, Effect, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { checkpoint, logicalOperationId } from "../durable/driver-run.js"
import { digest as canonicalDigest } from "../durable/canonical-json.js"
import { DriverInterpreter, operationKey, type StreamSuccessCodec } from "../durable/driver-interpreter.js"
import { LoopDriverState, modelCallOrdinal } from "../durable/loop-driver-state.js"
import { DriverStateInvalid } from "../durable/durable-driver.js"
import {
  CompletedModelOperation,
  ModelResponseContent,
  type AttemptCompleted,
  type AttemptEvent,
} from "../model/model-operation.js"
import type { RunError } from "./agent.js"

export type AttemptBody = (
  activePrompt: Prompt.Prompt,
  retryOverflow: boolean,
  compactOverflow?: boolean,
  overflowCause?: Cause.Cause<RunError>,
) => Stream.Stream<AttemptEvent, RunError, LanguageModel.LanguageModel | DriverInterpreter>

const encodeMessages = Schema.encodeUnknownSync(Schema.Array(Prompt.Message))

const BigIntTag = "@batonfx/core/BigInt"
const closeBigInts = (value: unknown): unknown => {
  if (typeof value === "bigint") return { [BigIntTag]: value.toString() }
  if (Array.isArray(value)) return value.map(closeBigInts)
  if (value === null || typeof value !== "object" || value instanceof Uint8Array || value instanceof URL) return value
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, closeBigInts(nested)]))
}
const openBigInts = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(openBigInts)
  if (value === null || typeof value !== "object") return value
  if (BigIntTag in value && typeof value[BigIntTag] === "string") return BigInt(value[BigIntTag])
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, openBigInts(nested)]))
}

const operationDigest = (value: unknown): string =>
  canonicalDigest(JSON.parse(Schema.encodeSync(Schema.UnknownFromJsonString)(value)))

const replayParts = (operationId: string, completed: AttemptCompleted): ReadonlyArray<AttemptEvent> => {
  const events = new Array<AttemptEvent>()
  for (const [index, part] of completed.response.content.entries()) {
    const common = {
      _tag: "Part" as const,
      messages: completed.messages,
      modelCallId: completed.modelCallId,
      modelAttemptId: completed.modelAttemptId,
      attempt: completed.attempt,
    }
    if (part.type === "text" || part.type === "reasoning") {
      const id = `${operationId}:replay:${part.type}:${index}`
      events.push(
        { ...common, part: Response.makePart(`${part.type}-start`, { id }) },
        { ...common, part: Response.makePart(`${part.type}-delta`, { id, delta: part.text, metadata: part.metadata }) },
        { ...common, part: Response.makePart(`${part.type}-end`, { id }) },
      )
    } else events.push({ ...common, part })
  }
  events.push(completed)
  return events
}

const successCodec = (input: {
  readonly operationId: string
  readonly turn: number
  readonly toolkit: Toolkit.Toolkit<Record<string, Tool.Any>>
  readonly completed: (operation: CompletedModelOperation, attempt: AttemptCompleted) => void
}): StreamSuccessCodec<AttemptEvent, CompletedModelOperation> => {
  const contentSchema = Schema.Array(Response.Part(input.toolkit)) as unknown as Schema.Codec<
    ReadonlyArray<Response.Part<Record<string, Tool.Any>>>,
    typeof ModelResponseContent.Encoded,
    never,
    never
  >
  const encodeContent = Schema.encodeUnknownSync(contentSchema)
  const decodeContent = Schema.decodeUnknownSync(contentSchema)
  const decodeMessages = Schema.decodeUnknownSync(Schema.Array(Prompt.Message))
  let terminal: AttemptCompleted | undefined
  return {
    observe: (event) => {
      if (event._tag !== "Completed") return
      if (terminal !== undefined)
        throw new Error(`Model operation ${input.operationId} emitted more than one completion`)
      terminal = event
    },
    isComplete: () => terminal !== undefined,
    complete: () => {
      if (terminal === undefined) throw new Error(`Model operation ${input.operationId} completed without a response`)
      const value = {
        operationId: input.operationId,
        turn: input.turn,
        modelCallId: terminal.modelCallId,
        modelAttemptId: terminal.modelAttemptId,
        attempt: terminal.attempt,
        messages: encodeMessages(closeBigInts(terminal.messages)),
        content: encodeContent(terminal.response.content),
        ...(terminal.response.usage === undefined
          ? {}
          : { usage: Schema.encodeSync(Response.Usage)(terminal.response.usage) }),
        ...(terminal.response.finishReason === undefined ? {} : { finishReason: terminal.response.finishReason }),
      }
      const operation = Schema.decodeUnknownSync(CompletedModelOperation)({
        ...value,
        digest: operationDigest(value),
      })
      input.completed(operation, terminal)
      return operation
    },
    replay: (success) => {
      const operation = Schema.decodeUnknownSync(CompletedModelOperation)(success)
      const { digest, ...value } = operation
      if (operationDigest(value) !== digest)
        throw new Error(`Model operation ${input.operationId} replay digest does not match its recorded result`)
      const content = decodeContent(operation.content) as unknown as ReadonlyArray<
        Response.Part<Record<string, Tool.Any>>
      >
      const attempt: AttemptCompleted = {
        _tag: "Completed",
        messages: openBigInts(decodeMessages(operation.messages)) as ReadonlyArray<Prompt.Message>,
        modelCallId: operation.modelCallId,
        modelAttemptId: operation.modelAttemptId,
        attempt: operation.attempt,
        response: {
          content,
          ...(operation.usage === undefined ? {} : { usage: Schema.decodeSync(Response.Usage)(operation.usage) }),
          ...(operation.finishReason === undefined ? {} : { finishReason: operation.finishReason }),
        },
      }
      input.completed(operation, attempt)
      return replayParts(input.operationId, attempt)
    },
  }
}

export const wrapDriverAttempt =
  (input: {
    readonly turn: number
    readonly toolkit: Toolkit.Toolkit<Record<string, Tool.Any>>
    readonly attemptBody: AttemptBody
    readonly completed: (operation: CompletedModelOperation, attempt: AttemptCompleted) => void
  }): AttemptBody =>
  (activePrompt, retryOverflow, compactOverflow = false, overflowCause) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const logicalId = yield* logicalOperationId
        const current = yield* checkpoint
        const driverState = yield* Schema.decodeUnknownEffect(LoopDriverState)(current.state).pipe(
          Effect.mapError((error) => DriverStateInvalid.make({ message: String(error) })),
        )
        const ordinal = modelCallOrdinal(driverState)
        const operationId = operationKey(logicalId, "model", input.turn, ordinal, "conversation")
        const interpreter = yield* DriverInterpreter
        return interpreter.runStream(
          {
            kind: "model",
            key: operationId,
            input: { turn: input.turn, modelCallOrdinal: ordinal, purpose: "conversation" },
            replayPolicy: "never",
          },
          input.attemptBody(activePrompt, retryOverflow, compactOverflow, overflowCause),
          {
            successCodec: successCodec({
              operationId,
              turn: input.turn,
              toolkit: input.toolkit,
              completed: input.completed,
            }),
          },
        )
      }),
    )
