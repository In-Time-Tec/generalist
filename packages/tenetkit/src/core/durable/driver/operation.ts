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

/** @experimental Operation scheduled at one agent-loop effect boundary. */
export interface OperationSpec extends OperationInput {
  readonly turn?: number
  readonly applyCheckpoint?: (checkpoint: DriverCheckpoint, outcome: OperationOutcome) => DriverCheckpoint
}

const ModelOperationInput = Schema.Struct({ modelCallOrdinal: Schema.Finite })
type PersistedReplayValue = Extract<OperationOutcome, { readonly _tag: "Succeeded" }>["value"]
const replaySchema = <A>() => Schema.declare((_value): _value is A => true)

export const decodeReplay = <A>(value: PersistedReplayValue): A => Schema.decodeUnknownSync(replaySchema<A>())(value)

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
