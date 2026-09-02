import { Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../../core/error-hint.js"

/** @experimental Transport framing, encoding, or connection operation failed. */
export class TransportError extends ActionableTaggedError<TransportError>()("generalist/transport/TransportError", {
  message: Schema.String,
  kind: Schema.optional(Schema.Literals(["socket", "protocol", "encoding", "not-open"])),
  hint: errorHint("Inspect kind and message, restore the transport, then retry only if the operation is safe."),
}) {}

/** @experimental A replay cursor supplied at the transport boundary is malformed. */
export class InvalidCursor extends ActionableTaggedError<InvalidCursor>()("generalist/transport/InvalidCursor", {
  value: Schema.String,
  hint: errorHint("Use an opaque cursor returned by this transport instead of constructing one."),
}) {}

/** @experimental A WebSocket command was received before the socket attached to a Run. */
export class NotAttached extends ActionableTaggedError<NotAttached>()("generalist/transport/NotAttached", {
  hint: errorHint("Attach the socket to a run before sending run commands."),
}) {}

/** @experimental A WebSocket command named a Run other than the socket's attached Run. */
export class RunMismatch extends ActionableTaggedError<RunMismatch>()("generalist/transport/RunMismatch", {
  attachedRunId: Schema.String,
  requestedRunId: Schema.String,
  hint: errorHint("Send commands only for the run currently attached to this socket."),
}) {}

/** @experimental Reconnection stopped after the configured schedule was exhausted. */
export class ReconnectExhausted extends ActionableTaggedError<ReconnectExhausted>()(
  "generalist/transport/ReconnectExhausted",
  {
    lastError: TransportError,
    hint: errorHint("Restore connectivity or provide a new bounded reconnect schedule before reconnecting."),
  },
) {}

/** @experimental A client or server wire frame could not be schema-encoded or decoded. */
export class WireCodecFailed extends ActionableTaggedError<WireCodecFailed>()("generalist/transport/WireCodecFailed", {
  message: Schema.String,
  hint: errorHint("Correct the wire frame to match the transport schema and protocol version."),
}) {}
