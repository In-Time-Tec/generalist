import { Schema } from "effect"

/** @experimental Transport framing, encoding, or connection operation failed. */
export class TransportError extends Schema.TaggedErrorClass<TransportError>()("@batonfx/transport/TransportError", {
  message: Schema.String,
}) {}

/** @experimental A WebSocket command was received before the socket attached to a session. */
export class NotAttached extends Schema.TaggedErrorClass<NotAttached>()("@batonfx/transport/NotAttached", {}) {}

/** @experimental A WebSocket frame named a session other than the socket's attached session. */
export class SessionMismatch extends Schema.TaggedErrorClass<SessionMismatch>()("@batonfx/transport/SessionMismatch", {
  attachedSessionId: Schema.String,
  requestedSessionId: Schema.String,
}) {}
