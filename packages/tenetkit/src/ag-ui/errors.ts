import { Schema } from "effect"

/** @experimental */
export class InputMalformed extends Schema.TaggedErrorClass<InputMalformed>()("tenetkit/ag-ui/InputMalformed", {
  detail: Schema.String,
}) {}

/** @experimental */
export class InputRejected extends Schema.TaggedErrorClass<InputRejected>()("tenetkit/ag-ui/InputRejected", {
  reason: Schema.Literals([
    "system-message",
    "developer-message",
    "client-tools",
    "final-message-not-user",
    "unsupported-user-content",
    "invalid-resume",
  ]),
}) {}

/** @experimental */
export class ResumeMismatch extends Schema.TaggedErrorClass<ResumeMismatch>()("tenetkit/ag-ui/ResumeMismatch", {
  runId: Schema.String,
  expectedWaitId: Schema.optionalKey(Schema.String),
  receivedWaitIds: Schema.Array(Schema.String),
}) {}

/** @experimental */
export class EventInvalid extends Schema.TaggedErrorClass<EventInvalid>()("tenetkit/ag-ui/EventInvalid", {
  source: Schema.Literals(["runtime", "ag-ui"]),
  detail: Schema.String,
}) {}

/** @experimental */
export class ValueNotSerializable extends Schema.TaggedErrorClass<ValueNotSerializable>()(
  "tenetkit/ag-ui/ValueNotSerializable",
  { field: Schema.String },
) {}
