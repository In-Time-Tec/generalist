import { Schema } from "effect"

/** @internal Stable built-in tool name used by journal projection. */
export const readToolName = "tasks_read"
/** @internal Stable built-in tool name used by journal projection. */
export const writeToolName = "tasks_write"

/** Lifecycle state of one journaled task. @experimental */
export const Status = Schema.Literals(["todo", "doing", "done"])
/** Lifecycle state of one journaled task. @experimental */
export type Status = typeof Status.Type

/** One model-owned task list entry. @experimental */
export const Item = Schema.Struct({
  id: Schema.String.check(Schema.isNonEmpty()),
  title: Schema.String.check(Schema.isNonEmpty()),
  status: Status,
  note: Schema.optionalKey(Schema.String),
})
/** One model-owned task list entry. @experimental */
export type Item = typeof Item.Type

/** The complete journaled task list. @experimental */
export const Items = Schema.Array(Item)
/** The complete journaled task list. @experimental */
export type Items = typeof Items.Type
