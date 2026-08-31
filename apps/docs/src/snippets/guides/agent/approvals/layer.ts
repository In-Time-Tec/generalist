import { Effect, Layer } from "effect"
import { Approvals, Permissions } from "generalist"

export const suspendForHumans: Layer.Layer<Approvals.Approvals> = Approvals.layerTest({
  resolve: (request) =>
    Effect.succeed<Approvals.Resolution>(
      request.call.name.startsWith("read_")
        ? { _tag: "Approved" }
        : { ...request, token: `approval:${request.call.id}` },
    ),
})
