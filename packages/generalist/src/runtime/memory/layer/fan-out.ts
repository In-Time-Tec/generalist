import { Effect } from "effect"
import { fanOutIdFor, MAX_FAN_OUT_MEMBERS } from "../../child/fan-out-internal.js"
import { FanOutInvalid, FanOutRemainderUnsupported } from "../../errors.js"
import type { Service as RunStore } from "../../run/store.js"
import type { InitialFanOutInput } from "../../service.js"
import { normalizedFanOutMember } from "./message.js"

export const normalizer = (store: RunStore) => (parentRunId: string, input: InitialFanOutInput) =>
  Effect.gen(function* () {
    if (input.concurrency !== undefined && (!Number.isSafeInteger(input.concurrency) || input.concurrency < 1)) {
      return yield* FanOutInvalid.make({ message: "fan-out concurrency must be a positive integer" })
    }
    if (input.members.length === 0 || input.members.length > MAX_FAN_OUT_MEMBERS) {
      return yield* FanOutInvalid.make({ message: `fan-out requires between 1 and ${MAX_FAN_OUT_MEMBERS} members` })
    }
    if (new Set(input.members.map((member) => member.key)).size !== input.members.length) {
      return yield* FanOutInvalid.make({ message: "fan-out member keys must be unique" })
    }
    if (
      input.join._tag === "Quorum" &&
      (!Number.isSafeInteger(input.join.required) ||
        input.join.required < 1 ||
        input.join.required > input.members.length)
    ) {
      return yield* FanOutInvalid.make({
        message: "fan-out quorum must be a positive safe integer no greater than member count",
      })
    }
    const info = yield* store.info
    if (input.remainder === "terminate") {
      return yield* FanOutRemainderUnsupported.make({ remainder: "terminate", durability: info.durability })
    }
    const fanOutId = fanOutIdFor(parentRunId, input.idempotencyKey)
    const members = input.members.map((member, ordinal) => normalizedFanOutMember({ fanOutId, ordinal, member }))
    return {
      parentRunId,
      idempotencyKey: input.idempotencyKey,
      members,
      concurrency: Math.min(input.concurrency ?? members.length, members.length),
      join: input.join,
      remainder: input.remainder,
      fanOutId,
    }
  })
