import { Effect, Layer } from "effect"
import {
  Doc,
  applyUpdate,
  createAbsolutePositionFromRelativePosition,
  createRelativePositionFromTypeIndex,
  encodeStateAsUpdate,
  encodeStateVector,
} from "yjs"
import {
  ArtifactCrdt,
  ArtifactRangeInvalid,
  ArtifactStorageError,
  type CrdtService,
  type RangeOperation,
} from "../../core/artifact.js"

const textName = "content"

const storageError = (artifact: string, operation: string, cause: unknown): ArtifactStorageError =>
  ArtifactStorageError.make({ artifact, operation, reason: String(cause) })

const document = (snapshot: Uint8Array): Doc => {
  const value = new Doc()
  applyUpdate(value, snapshot)
  return value
}

const range = (operation: RangeOperation): readonly [number, number] => {
  switch (operation._tag) {
    case "Insert":
      return [operation.at, operation.at]
    case "Delete":
    case "Replace":
      return [operation.from, operation.to]
  }
}

const edit = (input: {
  readonly artifact: string
  readonly base: Uint8Array
  readonly current: Uint8Array
  readonly operation: RangeOperation
}) =>
  Effect.gen(function* () {
    const baseDocument = yield* Effect.try({
      try: () => document(input.base),
      catch: (cause) => storageError(input.artifact, "load Yjs edit base", cause),
    })
    const baseText = baseDocument.getText(textName)
    const [from, to] = range(input.operation)
    if (from > to || to > baseText.length) {
      return yield* ArtifactRangeInvalid.make({
        artifact: input.artifact,
        length: baseText.length,
        from,
        to,
      })
    }
    return yield* Effect.try({
      try: () => {
        const start = createRelativePositionFromTypeIndex(baseText, from)
        const end = createRelativePositionFromTypeIndex(baseText, to)
        const currentDocument = document(input.current)
        const currentText = currentDocument.getText(textName)
        const currentStart = createAbsolutePositionFromRelativePosition(start, currentDocument)
        const currentEnd = createAbsolutePositionFromRelativePosition(end, currentDocument)
        if (currentStart?.type !== currentText || currentEnd?.type !== currentText) {
          throw new Error("the base is not an ancestor of the current snapshot")
        }
        const before = encodeStateVector(currentDocument)
        currentDocument.transact(() => {
          const length = currentEnd.index - currentStart.index
          switch (input.operation._tag) {
            case "Insert":
              currentText.insert(currentStart.index, input.operation.text)
              break
            case "Delete":
              currentText.delete(currentStart.index, length)
              break
            case "Replace":
              currentText.delete(currentStart.index, length)
              currentText.insert(currentStart.index, input.operation.text)
              break
          }
        })
        return {
          snapshot: encodeStateAsUpdate(currentDocument),
          update: encodeStateAsUpdate(currentDocument, before),
          content: currentText.toJSON(),
        }
      },
      catch: (cause) => storageError(input.artifact, "edit Yjs document", cause),
    })
  })

const service: CrdtService = {
  id: "yjs-v1",
  empty: (initial) =>
    Effect.sync(() => {
      const value = new Doc()
      if (initial !== "") value.getText(textName).insert(0, initial)
      return encodeStateAsUpdate(value)
    }).pipe(Effect.mapError((cause) => storageError("<new>", "create Yjs document", cause))),
  read: (snapshot) =>
    Effect.try({
      try: () => document(snapshot).getText(textName).toJSON(),
      catch: (cause) => storageError("<unknown>", "read Yjs document", cause),
    }),
  edit,
  apply: (snapshot, update) =>
    Effect.try({
      try: () => {
        const value = document(snapshot)
        applyUpdate(value, update)
        return encodeStateAsUpdate(value)
      },
      catch: (cause) => storageError("<unknown>", "apply Yjs update", cause),
    }),
}

/** Optional Yjs implementation of the Artifact CRDT boundary. @experimental */
// oxlint-disable-next-line effecttsgo/lazy-effect -- The issue contract intentionally exposes Yjs.layer().
export const layer = (): Layer.Layer<ArtifactCrdt> => Layer.succeed(ArtifactCrdt, service)

/** Yjs Artifact integration. @experimental */
export const Yjs = { layer } as const
