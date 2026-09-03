import { Option, Schema, Types } from "effect"
import type { RunEvent } from "../../runtime/run/event.js"
import type { Turn } from "../../trajectory/index.js"

export const TokenId = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const TokenMetadata = Schema.Struct({
  tokens: Schema.optionalKey(Schema.Array(TokenId)),
  logprobs: Schema.optionalKey(Schema.Array(Schema.Finite)),
})
type TokenMetadata = typeof TokenMetadata.Type

/** @experimental One durable conversation model-call operation. */
export const ModelCall = Schema.TaggedStruct("ModelCall", {
  operationId: Schema.String,
  modelCallId: Schema.String,
  turn: Schema.Finite,
  tokens: Schema.optionalKey(Schema.Array(TokenId)),
  logprobs: Schema.optionalKey(Schema.Array(Schema.Finite)),
})
/** @experimental */
export type ModelCall = typeof ModelCall.Type

type ModelEvent = Extract<RunEvent, { readonly _tag: "ModelResponseCommitted" | "ModelResponseInterrupted" }>

const tokenMetadata = (turn: Turn): TokenMetadata => {
  const chunks: Array<TokenMetadata> = []
  for (const part of turn.response.content) {
    const decoded = Schema.decodeUnknownOption(TokenMetadata, { onExcessProperty: "error" })(part.metadata.generalist)
    if (Option.isSome(decoded)) chunks.push(decoded.value)
  }
  if (chunks.length === 0) return {}
  const tokens = chunks.every((chunk) => chunk.tokens !== undefined)
    ? chunks.flatMap((chunk) => chunk.tokens!)
    : undefined
  const logprobs = chunks.every((chunk) => chunk.logprobs !== undefined)
    ? chunks.flatMap((chunk) => chunk.logprobs!)
    : undefined
  if (tokens !== undefined && logprobs !== undefined && tokens.length !== logprobs.length) return {}
  const metadata: Types.Mutable<TokenMetadata> = {}
  if (tokens !== undefined) metadata.tokens = tokens
  if (logprobs !== undefined) metadata.logprobs = logprobs
  return metadata
}

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal projection joins one event to its resolved turn.
export const fromTurn = (event: ModelEvent, turn: Turn): ModelCall => {
  const tokenData = tokenMetadata(turn)
  const operation: Types.Mutable<ModelCall> = {
    _tag: "ModelCall",
    operationId: event.operationKey,
    modelCallId: event.modelCallId,
    turn: event.turn,
  }
  if (tokenData.tokens !== undefined) operation.tokens = tokenData.tokens
  if (tokenData.logprobs !== undefined) operation.logprobs = tokenData.logprobs
  return operation
}
