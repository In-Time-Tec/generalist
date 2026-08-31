import { Effect, Schema } from "effect"

export const TreeCursor = Schema.String.pipe(Schema.brand("generalist/runtime/TreeCursor"))
export type TreeCursor = typeof TreeCursor.Type

export class TreeCursorInvalid extends Schema.TaggedError<TreeCursorInvalid>()("generalist/runtime/TreeCursorInvalid", {
  rootRunId: Schema.String,
  cursor: TreeCursor,
  message: Schema.String,
}) {}

/** @experimental The cursor belongs to a different root Run. */
export class TreeCursorRootMismatch extends Schema.TaggedError<TreeCursorRootMismatch>()(
  "generalist/runtime/TreeCursorRootMismatch",
  {
    rootRunId: Schema.String,
    cursor: TreeCursor,
    cursorRootRunId: Schema.String,
  },
) {}

const CursorPayload = Schema.Struct({
  version: Schema.Literal(1),
  projection: Schema.Literal("run-tree"),
  rootRunId: Schema.String,
  position: Schema.Finite,
})
type CursorPayload = typeof CursorPayload.Type

const prefix = "generalist-tree:"

export function make(rootRunId: string, position: number): TreeCursor
export function make(position: number): (rootRunId: string) => TreeCursor
export function make(
  rootRunIdOrPosition: string | number,
  maybePosition?: number,
): TreeCursor | ((rootRunId: string) => TreeCursor) {
  if (maybePosition === undefined) {
    if (!Schema.is(Schema.Finite)(rootRunIdOrPosition)) throw new TypeError("tree cursor position is required")
    return (rootRunId: string) => make(rootRunId, rootRunIdOrPosition)
  }
  if (!Schema.is(Schema.String)(rootRunIdOrPosition)) throw new TypeError("tree cursor root must be a string")
  return TreeCursor.make(
    `${prefix}${encodeURIComponent(JSON.stringify({ version: 1, projection: "run-tree", rootRunId: rootRunIdOrPosition, position: maybePosition }))}`,
  )
}

export const decodeCursor = (cursor: TreeCursor): CursorPayload => {
  if (!cursor.startsWith(prefix)) throw new Error("malformed tree cursor")
  return Schema.decodeUnknownSync(CursorPayload)(JSON.parse(decodeURIComponent(cursor.slice(prefix.length))))
}

export function parseCursor(
  rootRunId: string,
  cursor?: TreeCursor,
): Effect.Effect<number, TreeCursorInvalid | TreeCursorRootMismatch>
export function parseCursor(
  cursor?: TreeCursor,
): (rootRunId: string) => Effect.Effect<number, TreeCursorInvalid | TreeCursorRootMismatch>
export function parseCursor(
  rootRunIdOrCursor?: string,
  cursor?: TreeCursor,
):
  | Effect.Effect<number, TreeCursorInvalid | TreeCursorRootMismatch>
  | ((rootRunId: string) => Effect.Effect<number, TreeCursorInvalid | TreeCursorRootMismatch>) {
  if (arguments.length < 2) {
    const treeCursor = Schema.decodeSync(Schema.optional(TreeCursor))(rootRunIdOrCursor)
    return (rootRunId: string) => parseCursor(rootRunId, treeCursor)
  }
  const rootRunId = rootRunIdOrCursor ?? ""
  if (cursor === undefined) return Effect.succeed(-1)
  return Effect.try({
    try: () => {
      const value = decodeCursor(cursor)
      if (value.version !== 1) throw new Error("unsupported tree cursor version")
      if (value.projection !== "run-tree") throw new Error("unsupported tree cursor projection")
      if (!Number.isSafeInteger(value.position)) throw new Error("invalid tree cursor position")
      return value
    },
    catch: (cause) =>
      TreeCursorInvalid.make({
        rootRunId,
        cursor,
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  }).pipe(
    Effect.flatMap((value) =>
      value.rootRunId === rootRunId
        ? Effect.succeed(value.position)
        : Effect.fail(
            TreeCursorRootMismatch.make({
              rootRunId,
              cursor,
              cursorRootRunId: value.rootRunId,
            }),
          ),
    ),
  )
}
