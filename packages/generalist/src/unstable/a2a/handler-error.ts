import { Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../../core/error-hint.js"

/** @internal The task is not in a waitable state for the requested operation. */
export class TaskNotWaiting extends ActionableTaggedError<TaskNotWaiting>()("generalist/a2a/TaskNotWaiting", {
  taskId: Schema.String,
  message: Schema.String,
  hint: errorHint("Refresh the task and request this operation only while it is waiting for input."),
}) {}
