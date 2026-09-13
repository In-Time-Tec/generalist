import { Schema, type Types } from "effect"
import { Spend } from "../../core/durable/run-budget.js"
import {
  Placement,
  ReserveInput,
  ScopedCancelInput,
  ScopedReserveInput,
} from "../../runtime/child/external/placement.js"
import { RunOutcome } from "../../runtime/run.js"

const Settlement = Schema.Struct({
  placementId: Schema.String,
  settlementId: Schema.String,
  outcome: RunOutcome,
  spend: Schema.optionalKey(Spend),
})
const key = (...parts: readonly (string | number)[]) => JSON.stringify(parts)

export const externalChildCommands = {
  reserve: {
    tag: "external.reserve",
    input: Schema.Tuple([ReserveInput]),
    receipt: Placement,
    identity: ([input]: readonly [ReserveInput]) => key(input.runId, input.attemptFence, input.placementId),
  },
  reserveScoped: {
    tag: "external.reserveScoped",
    input: Schema.Tuple([ScopedReserveInput]),
    receipt: Placement,
    identity: ([input]: readonly [ScopedReserveInput]) => key(input.runId, input.attemptFence, input.placementId),
  },
  acknowledge: {
    tag: "external.acknowledge",
    input: Schema.Tuple([Schema.String]),
    receipt: Placement,
    identity: ([id]: readonly [string]) => id,
  },
  settle: {
    tag: "external.settle",
    input: Schema.Tuple([Settlement]),
    receipt: Placement,
    identity: ([input]: readonly [typeof Settlement.Type]) => key(input.placementId, input.settlementId),
  },
  cancel: {
    tag: "external.cancel",
    input: Schema.Tuple([Schema.String]),
    receipt: Placement,
    identity: ([id]: readonly [string]) => id,
  },
  cancelScoped: {
    tag: "external.cancelScoped",
    input: Schema.Tuple([ScopedCancelInput]),
    receipt: Placement,
    identity: ([input]: readonly [ScopedCancelInput]) => key(input.runId, input.commandId),
    digestInput: ([input]: readonly [ScopedCancelInput]): readonly [ScopedCancelInput] => {
      const normalized: Types.Mutable<ScopedCancelInput> = {
        runId: input.runId,
        ownerId: "",
        attemptFence: 0,
        session: {
          sessionId: input.session.sessionId,
          runId: input.session.runId,
          ownerId: "",
          runAttemptFence: 0,
          epoch: "0",
        },
        commandId: input.commandId,
        placementId: input.placementId,
      }
      if (input.reason !== undefined) normalized.reason = input.reason
      return [normalized]
    },
  },
} as const
