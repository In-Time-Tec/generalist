import { Effect, Function, Schema } from "effect"
import type { SqlError } from "effect/unstable/sql/SqlError"
import {
  ChildSelectionMissing,
  FanOutConflict,
  FanOutInvalid,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
} from "../../../errors.js"
import { fanOutMember } from "../../../child/session.js"
import type { FanOutReceipt } from "../../../child/fan-out.js"
import { childRunIdFor, fanOutIdFor, type AdmitFanOutInput } from "../../../child/fan-out-internal.js"
import type { AdmitStartInput } from "../../../run/store.js"
import type { SqlClient } from "effect/unstable/sql"
import { admitFanOut } from "./service.js"
import type { EventHub } from "../../subscribers.js"

type InitialFanOutsEffect = Effect.Effect<
  FanOutReceipt[],
  | ChildSelectionMissing
  | FanOutConflict
  | FanOutInvalid
  | RuntimeUnavailable
  | import("../../../errors.js").ChildDepthExceeded
  | import("../../../errors.js").ChildLimitExceeded
  | SqlError,
  SqlClient.SqlClient
>

type MutableAdmitFanOutInput = { -readonly [Key in keyof AdmitFanOutInput]: AdmitFanOutInput[Key] }

export const admitInitialFanOuts: {
  (parentRunId: string, fanOuts: AdmitStartInput["initialFanOuts"]): (hub: EventHub) => InitialFanOutsEffect
  (hub: EventHub, parentRunId: string, fanOuts: AdmitStartInput["initialFanOuts"]): InitialFanOutsEffect
} = Function.dual(3, (hub: EventHub, parentRunId: string, fanOuts: AdmitStartInput["initialFanOuts"]) =>
  Effect.forEach(fanOuts, (fanOut) => {
    const fanOutId = fanOutIdFor(parentRunId, fanOut.idempotencyKey)
    const input: MutableAdmitFanOutInput = {
      parentRunId,
      fanOutId,
      idempotencyKey: fanOut.idempotencyKey,
      join: fanOut.join,
      remainder: fanOut.remainder,
      members: fanOut.members.map((member, ordinal) => fanOutMember({ fanOutId, childRunIdFor, member, ordinal })),
    }
    if (fanOut.concurrency !== undefined) input.concurrency = Math.min(fanOut.concurrency, fanOut.members.length)
    return admitFanOut(hub, input).pipe(
      Effect.mapError((error) =>
        Schema.is(RunNotFound)(error) || Schema.is(RunTerminal)(error)
          ? RuntimeUnavailable.make({ message: "newly admitted root unavailable during initial fan-out admission" })
          : error,
      ),
    )
  }),
)
