import { Effect, Function, Schema } from "effect"
import type { SqlError } from "effect/unstable/sql/SqlError"
import {
  ChildSelectionMissing,
  FanOutConflict,
  FanOutInvalid,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
} from "../errors.js"
import { fanOutMember } from "../child-session.js"
import { childRunIdFor, fanOutIdFor, type FanOutReceipt } from "../fan-out.js"
import type { AdmitStartInput } from "../run-store.js"
import type { SqlClient } from "effect/unstable/sql"
import { admitFanOut } from "./store-fan-out.js"
import type { EventHub } from "./subscribers.js"

type InitialFanOutsEffect = Effect.Effect<
  FanOutReceipt[],
  | ChildSelectionMissing
  | FanOutConflict
  | FanOutInvalid
  | RuntimeUnavailable
  | import("../errors.js").ChildDepthExceeded
  | import("../errors.js").ChildLimitExceeded
  | SqlError,
  SqlClient.SqlClient
>

export const admitInitialFanOuts: {
  (parentRunId: string, fanOuts: AdmitStartInput["initialFanOuts"]): (hub: EventHub) => InitialFanOutsEffect
  (hub: EventHub, parentRunId: string, fanOuts: AdmitStartInput["initialFanOuts"]): InitialFanOutsEffect
} = Function.dual(3, (hub: EventHub, parentRunId: string, fanOuts: AdmitStartInput["initialFanOuts"]) =>
  Effect.forEach(fanOuts, (fanOut) => {
    const fanOutId = fanOutIdFor(parentRunId, fanOut.idempotencyKey)
    return admitFanOut(hub, {
      parentRunId,
      fanOutId,
      idempotencyKey: fanOut.idempotencyKey,
      ...(fanOut.concurrency === undefined ? {} : { concurrency: Math.min(fanOut.concurrency, fanOut.members.length) }),
      join: fanOut.join,
      remainder: fanOut.remainder,
      members: fanOut.members.map((member, ordinal) => fanOutMember({ fanOutId, childRunIdFor, member, ordinal })),
    }).pipe(
      Effect.mapError((error) =>
        Schema.is(RunNotFound)(error) || Schema.is(RunTerminal)(error)
          ? RuntimeUnavailable.make({ message: "newly admitted root unavailable during initial fan-out admission" })
          : error,
      ),
    )
  }),
)
