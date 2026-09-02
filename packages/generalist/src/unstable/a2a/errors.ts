import { Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../../core/error-hint.js"

/** @experimental The remote A2A message cannot be admitted as untrusted user input. */
export class MessageRejected extends ActionableTaggedError<MessageRejected>()("generalist/a2a/MessageRejected", {
  message: Schema.String,
  part: Schema.optionalKey(Schema.Int),
  hint: errorHint("Correct the identified untrusted message part and submit the message again."),
}) {}

/** @experimental Runtime state could not be projected to an A2A Task. */
export class TaskProjectionFailed extends ActionableTaggedError<TaskProjectionFailed>()(
  "generalist/a2a/TaskProjectionFailed",
  {
    taskId: Schema.String,
    message: Schema.String,
    cause: Schema.optionalKey(Schema.Defect()),
    hint: errorHint("Inspect cause and reconcile the named task with its Runtime state before retrying projection."),
  },
) {}
