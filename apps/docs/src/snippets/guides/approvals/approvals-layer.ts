import { Effect, Layer } from "effect"
import { Approvals } from "@batonfx/core"

export const suspendForHumans: Layer.Layer<Approvals.Approvals> = Approvals.testLayer({
  check: (request) =>
    Effect.succeed<Approvals.Decision>(
      request.call.name.startsWith("read_")
        ? { _tag: "Approved" }
        : { _tag: "Pending", token: `approval:${request.call.id}` },
    ),
})
