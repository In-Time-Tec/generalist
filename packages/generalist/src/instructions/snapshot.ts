import { Effect, Function, Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../core/error-hint.js"
import { GuidanceEntry, GuidanceScope, GuidanceSnapshotId } from "./entry.js"
import { GuidanceState, allEntries, make as makeState, snapshotId } from "./state.js"

/** Codec name a durable host records alongside a pinned guidance snapshot. */
export const codec = "generalist/instructions/snapshot"

/** Payload version a durable host records alongside a pinned guidance snapshot. */
export const version = "1"

/**
 * The exact secret-free payload a durable host pins into an executable registration. Entries are the
 * complete state; refinement history is deliberately excluded because it is audit data, not executable identity.
 */
export const SnapshotPayload = Schema.Struct({
  schemaVersion: Schema.Literal("1"),
  scope: GuidanceScope,
  entries: Schema.Array(GuidanceEntry),
})
export type SnapshotPayload = typeof SnapshotPayload.Type

/** One content-addressed guidance snapshot and the payload that reconstructs it. */
export const GuidanceSnapshot = Schema.Struct({ id: GuidanceSnapshotId, payload: SnapshotPayload })
export type GuidanceSnapshot = typeof GuidanceSnapshot.Type

/** A pinned snapshot payload does not reconstruct the snapshot it claims. */
export class SnapshotMismatch extends ActionableTaggedError<SnapshotMismatch>()(
  "generalist/instructions/SnapshotMismatch",
  {
    expected: Schema.String,
    actual: Schema.String,
    hint: errorHint("Load the snapshot whose payload digest matches its pinned snapshot id."),
  },
) {}

/** A pinned snapshot payload is not a valid guidance state. */
export class SnapshotInvalid extends ActionableTaggedError<SnapshotInvalid>()(
  "generalist/instructions/SnapshotInvalid",
  {
    message: Schema.String,
    hint: errorHint("Correct or replace the invalid snapshot payload before restoring guidance state."),
  },
) {}

/** Pin one exact state as a content-addressed snapshot. */
export const make = (state: GuidanceState): GuidanceSnapshot => ({
  id: snapshotId(state),
  payload: { schemaVersion: state.schemaVersion, scope: state.scope, entries: allEntries(state) },
})

const decodePayload = Schema.decodeUnknownEffect(SnapshotPayload, { onExcessProperty: "error" })
const encodePayload = Schema.encodeSync(SnapshotPayload)

/** Encode one snapshot payload as the closed JSON a registration carries. */
export const encode = (state: GuidanceState): typeof SnapshotPayload.Encoded => encodePayload(make(state).payload)

/** Reconstruct the exact state one pinned snapshot identifies. */
export const decode: {
  (
    payload: typeof SnapshotPayload.Encoded,
  ): (id: GuidanceSnapshotId) => Effect.Effect<GuidanceState, SnapshotInvalid | SnapshotMismatch>
  (
    id: GuidanceSnapshotId,
    payload: typeof SnapshotPayload.Encoded,
  ): Effect.Effect<GuidanceState, SnapshotInvalid | SnapshotMismatch>
} = Function.dual(
  2,
  (
    id: GuidanceSnapshotId,
    payload: typeof SnapshotPayload.Encoded,
  ): Effect.Effect<GuidanceState, SnapshotInvalid | SnapshotMismatch> =>
    decodePayload(payload).pipe(
      Effect.mapError((error) => SnapshotInvalid.make({ message: String(error) })),
      Effect.flatMap((decoded) => {
        const state = makeState({ scope: decoded.scope, entries: decoded.entries })
        const actual = snapshotId(state)
        return actual === id ? Effect.succeed(state) : Effect.fail(SnapshotMismatch.make({ expected: id, actual }))
      }),
    ),
)
