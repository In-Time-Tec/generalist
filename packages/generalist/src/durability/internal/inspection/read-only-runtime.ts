import { Effect } from "effect"
import { emptyState, type RuntimeState } from "../../../runtime/state/projection.js"
import { ObjectStore, ObjectStoreFailure, type Service } from "../../object-store.js"
import { defaultMaxCommitBytes, defaultMaxReplayBytes, make as makeJournal, snapshotByteLimit } from "../journal.js"
import { decode as decodeRuntimeState } from "../runtime-state.js"

const maxStateBytes = 64 * 1024 * 1024
const maxSnapshotBytes = snapshotByteLimit({ maxStateBytes, maxCommitBytes: defaultMaxCommitBytes })
const maxProviderBytes = maxSnapshotBytes + defaultMaxCommitBytes + defaultMaxReplayBytes
export const inspectionReadLimits = Object.freeze({
  objectsAndRequests: 4096,
  stateBytes: maxStateBytes,
  snapshotBytes: maxSnapshotBytes,
  providerBytes: maxProviderBytes,
})

const boundedStore = (store: Service): Service => {
  let remaining = inspectionReadLimits.objectsAndRequests
  let remainingBytes = inspectionReadLimits.providerBytes
  const spend = (operation: "read" | "list", key: string, amount: number) =>
    Effect.suspend(() => {
      remaining -= amount
      return remaining < 0
        ? Effect.fail(
            ObjectStoreFailure.make({
              operation,
              key,
              reason: "limit",
              message: `Inspection exceeds ${inspectionReadLimits.objectsAndRequests} objects and requests`,
            }),
          )
        : Effect.void
    })
  return {
    capabilities: store.capabilities,
    create: (key) =>
      Effect.fail(
        ObjectStoreFailure.make({
          operation: "create",
          key,
          reason: "invalid-response",
          message: "Inspection is read-only",
        }),
      ),
    read: (key, options) =>
      Effect.gen(function* () {
        yield* spend("read", key, 1)
        if (remainingBytes <= 0) {
          return yield* ObjectStoreFailure.make({
            operation: "read",
            key,
            reason: "limit",
            message: `Inspection exceeds ${inspectionReadLimits.providerBytes} provider bytes`,
          })
        }
        const object = yield* store.read(key, { ...options, maxBytes: Math.min(options.maxBytes, remainingBytes) })
        remainingBytes -= object?.bytes.length ?? 0
        if (remainingBytes < 0) {
          return yield* ObjectStoreFailure.make({
            operation: "read",
            key,
            reason: "limit",
            message: `Inspection exceeds ${inspectionReadLimits.providerBytes} provider bytes`,
          })
        }
        return object
      }),
    list: (prefix, options) =>
      Effect.gen(function* () {
        yield* spend("list", prefix, 1)
        const result = yield* store.list(prefix, options)
        if (!Array.isArray(result?.keys)) {
          return yield* ObjectStoreFailure.make({
            operation: "list",
            key: prefix,
            reason: "invalid-response",
            message: "Inspection received an invalid listing",
          })
        }
        yield* spend("list", prefix, result.keys.length)
        return result
      }),
  }
}

export interface ReadOnlyRuntimeState {
  readonly sequence: string
  readonly state?: RuntimeState
}

export const readOnlyRuntimeState = (namespace: {
  readonly environment: string
  readonly tenant: string
  readonly partition: string
}) =>
  Effect.gen(function* () {
    const store = yield* ObjectStore
    const journal = yield* makeJournal({
      ...namespace,
      maxStateBytes: inspectionReadLimits.stateBytes,
      maxReplayBytes: defaultMaxReplayBytes,
    }).pipe(Effect.provideService(ObjectStore, boundedStore(store)))
    const head = yield* journal.read
    if (head.sequence === "-1") return { sequence: head.sequence } satisfies ReadOnlyRuntimeState
    const state = yield* decodeRuntimeState(
      head.state,
      emptyState({ addressBindings: new Map(), subscriberQueueCapacity: 1 }),
    )
    return { sequence: head.sequence, state } satisfies ReadOnlyRuntimeState
  })
