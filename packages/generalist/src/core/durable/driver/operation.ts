import { Option, Schema } from "effect"
import {
  type DriverCheckpoint,
  type DriverOperation,
  type DriverOperationKind,
  type OperationOutcome,
  type ReplayPolicy,
  inputDigest,
} from "./contract.js"

interface OperationInput {
  readonly key: string
  readonly kind: DriverOperationKind
  readonly input: unknown
  readonly replayPolicy: ReplayPolicy
}

/** Operation scheduled at one agent-loop effect boundary. */
export interface OperationSpec<
  Success,
  Failure,
  SuccessDecodingServices = never,
  SuccessEncodingServices = never,
  FailureDecodingServices = never,
  FailureEncodingServices = never,
> extends OperationInput {
  readonly turn?: number
  readonly success: Schema.Codec<Success, unknown, SuccessDecodingServices, SuccessEncodingServices>
  readonly failure: Schema.Codec<Failure, unknown, FailureDecodingServices, FailureEncodingServices>
  readonly applyCheckpoint?: (checkpoint: DriverCheckpoint, outcome: OperationOutcome) => DriverCheckpoint
}

const ModelOperationInput = Schema.Struct({ modelCallOrdinal: Schema.Finite })

export const fromInput = (input: OperationInput): DriverOperation => ({
  key: input.key,
  kind: input.kind,
  input: input.input,
  replayPolicy: input.replayPolicy,
  inputDigest: inputDigest(input.input),
})

export const modelCallOrdinal = (input: OperationInput): number | undefined => {
  if (input.kind !== "model" && input.kind !== "structured-output") return undefined
  return Option.getOrUndefined(Schema.decodeUnknownOption(ModelOperationInput)(input.input))?.modelCallOrdinal
}
