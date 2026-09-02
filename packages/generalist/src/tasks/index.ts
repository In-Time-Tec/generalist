import { Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { layer as taskLayer } from "./internal.js"
import { Item, Items, readToolName, Status, writeToolName } from "./item.js"

export { Item, Items, Status, type Item as TaskItem, type Items as TaskItems, type Status as TaskStatus }

/** Add `tasks_read` and `tasks_write` to Agents running in this environment. @experimental */
// oxlint-disable-next-line effecttsgo/lazy-effect -- The issue contract intentionally exposes Tasks.layer() alongside the other Layer constructors.
export const layer = () => taskLayer

/** One partial task edit sent through Runtime steering. @experimental */
export const Update = Schema.Struct({
  id: Schema.String.check(Schema.isNonEmpty()),
  title: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty())),
  status: Schema.optionalKey(Status),
  note: Schema.optionalKey(Schema.NullOr(Schema.String)),
})
/** One partial task edit sent through Runtime steering. @experimental */
export type Update = typeof Update.Type

/** Build a steering prompt that applies partial edits through one complete `tasks_write`. @experimental */
export const update = (updates: ReadonlyArray<Update>): Prompt.Prompt => {
  const encoded = Schema.encodeSync(Schema.Array(Update))(updates)
  return Prompt.make(
    [
      "Update the journaled task list now.",
      `Call ${readToolName}, merge the following edits by id while preserving unmentioned tasks and fields, then call ${writeToolName} exactly once with the complete updated list.`,
      "A null note removes that note. Do not merely describe the update.",
      `<task-updates>${JSON.stringify(encoded)}</task-updates>`,
    ].join("\n"),
  )
}
