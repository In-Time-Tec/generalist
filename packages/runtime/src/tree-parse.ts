import { Effect } from "effect"
import { TreeCursorInvalid } from "./errors.js"
import { decodeCursor, TreeCursor, type TreeCursor as TreeCursorType } from "./tree-cursor.js"

export const parseCursor: {
  (rootRunId: string, cursor?: TreeCursorType): Effect.Effect<number, TreeCursorInvalid>
  (cursor?: TreeCursorType): (rootRunId: string) => Effect.Effect<number, TreeCursorInvalid>
} = (...args: [string?, TreeCursorType?]): any => {
  const [rootRunIdOrCursor, cursor] = args
  if (args.length < 2)
    return (rootRunId: string) => parseCursor(rootRunId, rootRunIdOrCursor as TreeCursorType | undefined)
  const rootRunId = rootRunIdOrCursor as string
  return Effect.try({
    try: () => {
      if (cursor === undefined) return -1
      const value = decodeCursor(cursor)
      if (value.version !== 1) throw new Error("unsupported tree cursor version")
      if (value.projection !== "run-tree") throw new Error("unsupported tree cursor projection")
      if (value.rootRunId !== rootRunId) throw new Error("tree cursor root mismatch")
      if (!Number.isSafeInteger(value.position) || value.position < -1) throw new Error("invalid tree cursor position")
      return value.position
    },
    catch: (cause) =>
      TreeCursorInvalid.make({
        rootRunId,
        cursor: cursor ?? TreeCursor.make(""),
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  })
}
