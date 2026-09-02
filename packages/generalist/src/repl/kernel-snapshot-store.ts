import { Context, Effect, Schema } from "effect"
import { digest } from "../core/durable/canonical-json.js"
import { DropReason, Epoch, SessionId } from "./cell.js"

/** How one binding was put back into a restored namespace. */
export const RestoreKind = Schema.Literals(["value", "source", "import"])
export type RestoreKind = typeof RestoreKind.Type

/** One binding that survived the snapshot. */
export const RestoredBinding = Schema.Struct({
  name: Schema.String.check(Schema.isNonEmpty()),
  kind: RestoreKind,
})
export type RestoredBinding = typeof RestoredBinding.Type

/** One binding the snapshot could not carry, and why. */
export const DroppedBinding = Schema.Struct({
  name: Schema.String.check(Schema.isNonEmpty()),
  reason: DropReason,
})
export type DroppedBinding = typeof DroppedBinding.Type

/**
 * The honest saved/dropped account of one snapshot. It names every binding that comes
 * back and every binding that does not, so the model is told exactly what it lost.
 */
export const Manifest = Schema.Struct({
  sessionId: SessionId,
  epoch: Epoch,
  profileDigest: Schema.String.check(Schema.isNonEmpty()),
  savedAtMillis: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  restored: Schema.Array(RestoredBinding),
  dropped: Schema.Array(DroppedBinding),
})
export type Manifest = typeof Manifest.Type

/** One persisted kernel namespace: opaque payload plus its manifest. */
export interface Snapshot {
  readonly manifest: Manifest
  readonly payload: Uint8Array
}

/** Content identity of one immutable namespace image. */
export const snapshotId = (snapshot: Snapshot): string =>
  `kernel-snapshot:v1:sha256:${digest({
    manifest: Schema.encodeSync(Manifest)(snapshot.manifest),
    payload: Array.from(snapshot.payload),
  })}`

/** A snapshot store operation failed. Restore failure is non-fatal and reported. */
export class KernelStateUnavailable extends Schema.TaggedError<KernelStateUnavailable>()(
  "generalist/repl/KernelStateUnavailable",
  {
    sessionId: Schema.String,
    reason: Schema.Literals(["missing", "corrupt", "io"]),
    message: Schema.String,
  },
) {}

/**
 * Best-effort namespace persistence. Never durable authority: Generalist operations,
 * events, Session entries, and children remain the only truth.
 */
export interface Service {
  readonly load: (sessionId: SessionId) => Effect.Effect<Snapshot | undefined, KernelStateUnavailable>
  readonly save: (snapshot: Snapshot) => Effect.Effect<void, KernelStateUnavailable>
  readonly drop: (sessionId: SessionId) => Effect.Effect<void, KernelStateUnavailable>
  /** Persist one immutable namespace image and return its durable content identity. */
  readonly saveImmutable: (snapshot: Snapshot) => Effect.Effect<string, KernelStateUnavailable>
  /** Load one immutable namespace image by its durable content identity. */
  readonly loadImmutable: (snapshotId: string) => Effect.Effect<Snapshot | undefined, KernelStateUnavailable>
}
export class KernelSnapshotStore extends Context.Service<KernelSnapshotStore, Service>()(
  "generalist/repl/kernel-snapshot-store/KernelSnapshotStore",
) {}
