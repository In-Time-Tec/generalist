import { Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../../core/error-hint.js"

/** @experimental */
export class InputMalformed extends ActionableTaggedError<InputMalformed>()("generalist/ag-ui/InputMalformed", {
  detail: Schema.String,
  hint: errorHint("Correct the malformed AG-UI input described by detail and submit it again."),
}) {}

/** @experimental */
export class InputRejected extends ActionableTaggedError<InputRejected>()("generalist/ag-ui/InputRejected", {
  reason: Schema.Literals([
    "system-message",
    "developer-message",
    "client-tools",
    "final-message-not-user",
    "unsupported-user-content",
    "invalid-resume",
  ]),
  hint: errorHint("Remove the rejected input shape or convert it to supported user content."),
}) {}

/** @experimental */
export class ResumeMismatch extends ActionableTaggedError<ResumeMismatch>()("generalist/ag-ui/ResumeMismatch", {
  runId: Schema.String,
  expectedWaitId: Schema.optionalKey(Schema.String),
  receivedWaitIds: Schema.Array(Schema.String),
  hint: errorHint("Resume the named run with exactly the wait id currently expected by the Runtime."),
}) {}

/** @experimental */
export class EventInvalid extends ActionableTaggedError<EventInvalid>()("generalist/ag-ui/EventInvalid", {
  source: Schema.Literals(["runtime", "ag-ui"]),
  detail: Schema.String,
  hint: errorHint("Inspect source and detail, then correct the invalid event producer before retrying."),
}) {}

/** @experimental */
export class ValueNotSerializable extends ActionableTaggedError<ValueNotSerializable>()(
  "generalist/ag-ui/ValueNotSerializable",
  {
    field: Schema.String,
    hint: errorHint("Convert the named field to an AG-UI serializable value before emitting it."),
  },
) {}
