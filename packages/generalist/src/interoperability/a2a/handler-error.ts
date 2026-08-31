import { Schema } from "effect"

/** @internal The task is not in a waitable state for the requested operation. */
export class TaskNotWaiting extends Schema.TaggedError<TaskNotWaiting>()("generalist/a2a/TaskNotWaiting", {
  taskId: Schema.String,
  message: Schema.String,
}) {}
