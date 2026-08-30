import { Cause, Effect, Option, Schema, Stream } from "effect"
import { Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { checkpoint, logicalOperationId } from "../../durable/driver/run.js"
import { digest as canonicalDigest } from "../../durable/canonical-json.js"
import { DriverInterpreter, operationKey, type StreamSuccessCodec } from "../../durable/driver/interpreter.js"
import { LoopDriverState, modelCallOrdinal } from "../../durable/loop-driver-state.js"
import { DriverStateInvalid } from "../../durable/service.js"
import {
  CompletedModelOperation,
  ModelResponseContent,
  type AttemptCompleted,
  type AttemptEvent,
} from "../../model/operation.js"
import type { RunError } from "../service.js"
import type { ActiveModelServices } from "./context.js"
import { promptDigest } from "../prompt-identity.js"

export type AttemptBody = (
  activePrompt: Prompt.Prompt,
  retryOverflow: boolean,
  compactOverflow?: boolean,
  overflowCause?: Cause.Cause<RunError>,
  operationKey?: string,
) => Stream.Stream<AttemptEvent, RunError, ActiveModelServices<Record<string, Tool.Any>, never>>

type OperationDigestInput = typeof Schema.Unknown.Type

const operationDigest = (value: OperationDigestInput): string =>
  canonicalDigest(JSON.parse(Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(value)))

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
  readonly replayMessages: (sessionParentId: string) => Effect.Effect<ReadonlyArray<Prompt.Message>, RunError>
  readonly fallbackMessages: (replayFromHistory: boolean) => Effect.Effect<ReadonlyArray<Prompt.Message>, RunError>
  readonly completed: (operation: CompletedModelOperation, attempt: AttemptCompleted) => void
}): StreamSuccessCodec<AttemptEvent, CompletedModelOperation, RunError> => {
  const encodeContent = Schema.encodeUnknownSync(ModelResponseContent)
  const decodeContent = Schema.decodeUnknownSync(ModelResponseContent)
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
      const encodedContent = encodeContent(terminal.response.content)
      const value = {
        operationId: input.operationId,
        turn: input.turn,
        modelCallId: terminal.modelCallId,
        modelAttemptId: terminal.modelAttemptId,
        attempt: terminal.attempt,
        sessionParentId: terminal.sessionParentId,
        replayFromHistory: terminal.replayFromHistory,
        content: encodedContent,
        budgetCharge: terminal.budgetCharge,
      }
      if (terminal.response.usage !== undefined)
        Object.assign(value, { usage: Schema.encodeSync(Response.Usage)(terminal.response.usage) })
      if (terminal.response.finishReason !== undefined)
        Object.assign(value, { finishReason: terminal.response.finishReason })
      const operation = Schema.decodeSync(CompletedModelOperation)({
        ...value,
        digest: operationDigest(value),
      })
      input.completed(operation, terminal)
      return operation
    },
    replay: (success) =>
      Stream.fromEffect(
        Effect.gen(function* () {
          const operation = yield* Schema.decodeEffect(CompletedModelOperation)(success).pipe(Effect.orDie)
          const { digest, ...value } = operation
          if (operationDigest(value) !== digest)
            return yield* Effect.die(
              new Error(`Model operation ${input.operationId} replay digest does not match its recorded result`),
            )
          const content = decodeContent(operation.content).map((part): Response.Part<Record<string, Tool.Any>> => {
            if (part.type === "tool-call") return Response.makePart("tool-call", part)
            if (part.type === "tool-result") return Response.makePart("tool-result", part)
            return part
          })
          const messages =
            operation.sessionParentId === null
              ? yield* input.fallbackMessages(operation.replayFromHistory)
              : yield* input.replayMessages(operation.sessionParentId)
          const usage =
            operation.usage === undefined
              ? undefined
              : yield* Schema.decodeEffect(Response.Usage)(operation.usage).pipe(Effect.orDie)
          const response: AttemptCompleted["response"] = { content }
          if (usage !== undefined) Object.assign(response, { usage })
          if (operation.finishReason !== undefined) Object.assign(response, { finishReason: operation.finishReason })
          const attempt: AttemptCompleted = {
            _tag: "Completed",
            messages,
            modelCallId: operation.modelCallId,
            modelAttemptId: operation.modelAttemptId,
            attempt: operation.attempt,
            sessionParentId: operation.sessionParentId,
            replayFromHistory: operation.replayFromHistory,
            response,
            budgetCharge: operation.budgetCharge,
          }
          input.completed(operation, attempt)
          return replayParts(input.operationId, attempt)
        }),
      ).pipe(Stream.flatMap(Stream.fromIterable)),
  }
}

export const wrapDriverAttempt =
  (input: {
    readonly turn: number
    readonly toolkit: Toolkit.Toolkit<Record<string, Tool.Any>>
    readonly attemptBody: AttemptBody
    readonly replayMessages: (sessionParentId: string) => Effect.Effect<ReadonlyArray<Prompt.Message>, RunError>
    readonly fallbackMessages: (
      activePrompt: Prompt.Prompt,
      replayFromHistory: boolean,
    ) => Effect.Effect<ReadonlyArray<Prompt.Message>, RunError>
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
        const requestMessages = yield* input.fallbackMessages(activePrompt, false)
        const pendingInput = driverState.pending?.key === operationId ? driverState.pending.input : undefined
        const persistedPromptDigest = Schema.decodeUnknownOption(Schema.Struct({ promptDigest: Schema.String }))(
          pendingInput,
        ).pipe(
          Option.map((decoded) => decoded.promptDigest),
          Option.getOrUndefined,
        )
        const interpreter = yield* DriverInterpreter
        return interpreter.runStream(
          {
            kind: "model",
            key: operationId,
            turn: input.turn,
            input: {
              turn: input.turn,
              modelCallOrdinal: ordinal,
              purpose: "conversation",
              promptDigest: persistedPromptDigest ?? promptDigest(requestMessages),
            },
            replayPolicy: "never",
          },
          input.attemptBody(activePrompt, retryOverflow, compactOverflow, overflowCause, operationId),
          {
            successCodec: successCodec({
              operationId,
              turn: input.turn,
              toolkit: input.toolkit,
              replayMessages: input.replayMessages,
              fallbackMessages: (replayFromHistory) => input.fallbackMessages(activePrompt, replayFromHistory),
              completed: input.completed,
            }),
          },
        )
      }),
    )
