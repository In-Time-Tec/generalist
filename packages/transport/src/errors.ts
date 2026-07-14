import { Schema } from "effect"

/** @experimental Transport framing, encoding, or connection operation failed. */
export class TransportError extends Schema.TaggedErrorClass<TransportError>()("@batonfx/transport/TransportError", {
  message: Schema.String,
  kind: Schema.optional(Schema.Literals(["socket", "protocol", "encoding", "not-open"])),
}) {}

/** @experimental A WebSocket command was received before the socket attached to a session. */
export class NotAttached extends Schema.TaggedErrorClass<NotAttached>()("@batonfx/transport/NotAttached", {}) {}

/** @experimental A WebSocket frame named a session other than the socket's attached session. */
export class SessionMismatch extends Schema.TaggedErrorClass<SessionMismatch>()("@batonfx/transport/SessionMismatch", {
  attachedSessionId: Schema.String,
  requestedSessionId: Schema.String,
}) {}

/** @experimental Reconnection stopped after the configured schedule was exhausted. */
export class ReconnectExhausted extends Schema.TaggedErrorClass<ReconnectExhausted>()(
  "@batonfx/transport/ReconnectExhausted",
  {
    lastError: TransportError,
  },
) {}

/** @experimental A client or server wire frame could not be schema-encoded. */
export class WireEncodeError extends Schema.TaggedErrorClass<WireEncodeError>()("@batonfx/transport/WireEncodeError", {
  message: Schema.String,
}) {}
