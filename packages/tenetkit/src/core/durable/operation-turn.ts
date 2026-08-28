import { Effect } from "effect"
import { DriverStateInvalid } from "./service.js"

const resolveOperationTurn = (checkpointTurn: number, requestedTurn: number | undefined) => {
  const turn = requestedTurn ?? checkpointTurn
  return !Number.isSafeInteger(turn) || turn < 0 || turn < checkpointTurn
    ? DriverStateInvalid.make({ message: `Operation turn ${turn} cannot precede checkpoint turn ${checkpointTurn}` })
    : Effect.succeed(turn)
}

export const OperationTurn = { resolve: resolveOperationTurn }
