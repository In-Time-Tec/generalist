import { Schema } from "effect"

/** @experimental Transport framing, encoding, or connection operation failed. */
export class TransportError extends Schema.TaggedError<TransportError>()("generalist/transport/TransportError", {
  message: Schema.String,
  kind: Schema.optional(Schema.Literals(["socket", "protocol", "encoding", "not-open"])),
}) {}

/** @experimental A replay cursor supplied at the transport boundary is malformed. */
export class InvalidCursor extends Schema.TaggedError<InvalidCursor>()("generalist/transport/InvalidCursor", {
  value: Schema.String,
}) {}

/** @experimental A WebSocket command was received before the socket attached to a Run. */
export class NotAttached extends Schema.TaggedError<NotAttached>()("generalist/transport/NotAttached", {}) {}

/** @experimental A WebSocket command named a Run other than the socket's attached Run. */
export class RunMismatch extends Schema.TaggedError<RunMismatch>()("generalist/transport/RunMismatch", {
  attachedRunId: Schema.String,
  requestedRunId: Schema.String,
}) {}

/** @experimental Reconnection stopped after the configured schedule was exhausted. */
export class ReconnectExhausted extends Schema.TaggedError<ReconnectExhausted>()(
  "generalist/transport/ReconnectExhausted",
  {
    lastError: TransportError,
  },
) {}

/** @experimental A client or server wire frame could not be schema-encoded or decoded. */
export class WireCodecFailed extends Schema.TaggedError<WireCodecFailed>()("generalist/transport/WireCodecFailed", {
  message: Schema.String,
}) {}
