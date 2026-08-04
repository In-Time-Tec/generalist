import { Schema } from "effect"
import { ReplayPolicy } from "./driver-contract.js"
import { WaitDefinition } from "./driver-contract.js"
import { DriverOperationKind } from "./driver-contract.js"

/** @experimental Pending operation the interpreter schedules before decide. */
export const PendingOperation = Schema.Struct({
  kind: DriverOperationKind,
  key: Schema.String,
  input: Schema.Unknown,
  replayPolicy: ReplayPolicy,
})

/** @experimental */
export type PendingOperation = typeof PendingOperation.Type

/** @experimental Production loop driver state stored in DriverCheckpoint.state. */
export const LoopDriverState = Schema.Struct({
  logicalOperationId: Schema.String,
  sessionId: Schema.String,
  modelCallOrdinal: Schema.Finite,
  modelCallOrdinalStart: Schema.Finite,
  pending: Schema.optionalKey(PendingOperation),
  wait: Schema.optionalKey(WaitDefinition),
  suspensionToken: Schema.optionalKey(Schema.String),
  terminal: Schema.optionalKey(
    Schema.Struct({
      text: Schema.String,
      turns: Schema.Finite,
    }),
  ),
})

/** @experimental */
export type LoopDriverState = typeof LoopDriverState.Type
