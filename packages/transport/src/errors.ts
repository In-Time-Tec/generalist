import { Schema } from "effect"

/** @experimental Transport framing, encoding, or connection operation failed. */
export class TransportError extends Schema.TaggedErrorClass<TransportError>()("@batonfx/transport/TransportError", {
  message: Schema.String,
}) {}
