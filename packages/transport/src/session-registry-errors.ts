import { Schema } from "effect"

/** @experimental */
export class SessionError extends Schema.TaggedErrorClass<SessionError>()("@batonfx/transport/SessionError", {
  message: Schema.String,
}) {}

/** @experimental */
export class SessionBusy extends Schema.TaggedErrorClass<SessionBusy>()("@batonfx/transport/SessionBusy", {
  sessionId: Schema.String,
}) {}

/** @experimental */
export class SessionQueueFull extends Schema.TaggedErrorClass<SessionQueueFull>()(
  "@batonfx/transport/SessionQueueFull",
  {
    sessionId: Schema.String,
    capacity: Schema.Finite,
  },
) {}

/** @experimental */
export class SubscriberLagged extends Schema.TaggedErrorClass<SubscriberLagged>()(
  "@batonfx/transport/SubscriberLagged",
  {
    sessionId: Schema.String,
    lastDeliveredSeq: Schema.Finite,
  },
) {}
