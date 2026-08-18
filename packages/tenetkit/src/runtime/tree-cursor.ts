import { Schema } from "effect"

export const TreeCursor = Schema.String.pipe(Schema.brand("tenetkit/runtime/TreeCursor"))
export type TreeCursor = typeof TreeCursor.Type

interface CursorPayload {
  readonly version: 1
  readonly projection: "run-tree"
  readonly rootRunId: string
  readonly position: number
}

const prefix = "tenetkit-tree:"

export const makeCursor: {
  (rootRunId: string, position: number): TreeCursor
  (position: number): (rootRunId: string) => TreeCursor
} = (rootRunIdOrPosition: string | number, maybePosition?: number): any => {
  if (maybePosition === undefined) {
    const position = rootRunIdOrPosition as number
    return (rootRunId: string) => makeCursor(rootRunId, position)
  }
  const rootRunId = rootRunIdOrPosition as string
  const position = maybePosition as number
  return TreeCursor.make(
    `${prefix}${encodeURIComponent(JSON.stringify({ version: 1, projection: "run-tree", rootRunId, position }))}`,
  )
}

export const decodeCursor = (cursor: TreeCursor): CursorPayload => {
  if (!cursor.startsWith(prefix)) throw new Error("malformed tree cursor")
  return JSON.parse(decodeURIComponent(cursor.slice(prefix.length))) as CursorPayload
}
