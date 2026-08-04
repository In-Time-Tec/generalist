import { Schema } from "effect"

/** @experimental The remote A2A message cannot be admitted as untrusted user input. */
export class MessageRejected extends Schema.TaggedErrorClass<MessageRejected>()("@batonfx/a2a/MessageRejected", {
  message: Schema.String,
  part: Schema.optionalKey(Schema.Int),
}) {}

/** @experimental Runtime state could not be projected to an A2A Task. */
export class TaskProjectionFailed extends Schema.TaggedErrorClass<TaskProjectionFailed>()(
  "@batonfx/a2a/TaskProjectionFailed",
  {
    taskId: Schema.String,
    message: Schema.String,
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}
