import { Effect, Function, Schema } from "effect"
import { HarnessEntry, HarnessScope, HarnessSnapshotId } from "./entry.js"
import { HarnessState, allEntries, make, snapshotId } from "./state.js"

/** @experimental Codec name a durable host records alongside a pinned harness snapshot. */
export const CODEC = "tenetkit/harness/snapshot"

/** @experimental Payload version a durable host records alongside a pinned harness snapshot. */
export const VERSION = "1"

/**
 * @experimental The exact secret-free payload a durable host pins into an executable registration. Entries are the
 * complete state; refinement history is deliberately excluded because it is audit data, not executable identity.
 */
export const SnapshotPayload = Schema.Struct({
  schemaVersion: Schema.Literal("1"),
  scope: HarnessScope,
  entries: Schema.Array(HarnessEntry),
})
/** @experimental */
export type SnapshotPayload = typeof SnapshotPayload.Type

/** @experimental One content-addressed harness snapshot and the payload that reconstructs it. */
export const HarnessSnapshot = Schema.Struct({ id: HarnessSnapshotId, payload: SnapshotPayload })
/** @experimental */
export type HarnessSnapshot = typeof HarnessSnapshot.Type

/** @experimental A pinned snapshot payload does not reconstruct the snapshot it claims. */
export class SnapshotMismatch extends Schema.TaggedErrorClass<SnapshotMismatch>()("tenetkit/harness/SnapshotMismatch", {
  expected: Schema.String,
  actual: Schema.String,
}) {}

/** @experimental A pinned snapshot payload is not a valid harness state. */
export class SnapshotInvalid extends Schema.TaggedErrorClass<SnapshotInvalid>()("tenetkit/harness/SnapshotInvalid", {
  message: Schema.String,
}) {}

/** @experimental Pin one exact state as a content-addressed snapshot. */
export const snapshot = (state: HarnessState): HarnessSnapshot => ({
  id: snapshotId(state),
  payload: { schemaVersion: state.schemaVersion, scope: state.scope, entries: allEntries(state) },
})

const decodePayload = Schema.decodeUnknownEffect(SnapshotPayload, { onExcessProperty: "error" })
const encodePayload = Schema.encodeSync(SnapshotPayload)

/** @experimental Encode one snapshot payload as the closed JSON a registration carries. */
export const encode = (state: HarnessState): unknown => encodePayload(snapshot(state).payload)

/** @experimental Reconstruct the exact state one pinned snapshot identifies. */
export const decode: {
  (payload: unknown): (id: HarnessSnapshotId) => Effect.Effect<HarnessState, SnapshotInvalid | SnapshotMismatch>
  (id: HarnessSnapshotId, payload: unknown): Effect.Effect<HarnessState, SnapshotInvalid | SnapshotMismatch>
} = Function.dual(
  2,
  (id: HarnessSnapshotId, payload: unknown): Effect.Effect<HarnessState, SnapshotInvalid | SnapshotMismatch> =>
    decodePayload(payload).pipe(
      Effect.mapError((error) => SnapshotInvalid.make({ message: String(error) })),
      Effect.flatMap((decoded) => {
        const state = make({ scope: decoded.scope, entries: decoded.entries })
        const actual = snapshotId(state)
        return actual === id ? Effect.succeed(state) : Effect.fail(SnapshotMismatch.make({ expected: id, actual }))
      }),
    ),
)
