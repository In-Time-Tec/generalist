import { Context, Effect, Schema } from "effect"
import { DropReason, Epoch, SessionId } from "./cell.js"

/** @experimental How one binding was put back into a restored namespace. */
export const RestoreKind = Schema.Literals(["value", "source", "import"])
/** @experimental */
export type RestoreKind = typeof RestoreKind.Type

/** @experimental One binding that survived the snapshot. */
export const RestoredBinding = Schema.Struct({
  name: Schema.String.check(Schema.isNonEmpty()),
  kind: RestoreKind,
})
/** @experimental */
export type RestoredBinding = typeof RestoredBinding.Type

/** @experimental One binding the snapshot could not carry, and why. */
export const DroppedBinding = Schema.Struct({
  name: Schema.String.check(Schema.isNonEmpty()),
  reason: DropReason,
})
/** @experimental */
export type DroppedBinding = typeof DroppedBinding.Type

/**
 * @experimental The honest saved/dropped account of one snapshot. It names every binding that comes
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
/** @experimental */
export type Manifest = typeof Manifest.Type

/** @experimental One persisted kernel namespace: opaque payload plus its manifest. */
export interface Snapshot {
  readonly manifest: Manifest
  readonly payload: Uint8Array
}

/** @experimental A snapshot store operation failed. Restore failure is non-fatal and reported. */
export class KernelStateUnavailable extends Schema.TaggedError<KernelStateUnavailable>()(
  "tenetkit/repl/KernelStateUnavailable",
  {
    sessionId: Schema.String,
    reason: Schema.Literals(["missing", "corrupt", "io"]),
    message: Schema.String,
  },
) {}

/**
 * @experimental Best-effort namespace persistence. Never durable authority: TenetKit operations,
 * events, Session entries, and children remain the only truth.
 */
export interface Interface {
  readonly load: (sessionId: SessionId) => Effect.Effect<Snapshot | undefined, KernelStateUnavailable>
  readonly save: (snapshot: Snapshot) => Effect.Effect<void, KernelStateUnavailable>
  readonly drop: (sessionId: SessionId) => Effect.Effect<void, KernelStateUnavailable>
}

/** @experimental */
export class KernelStateStore extends Context.Service<KernelStateStore, Interface>()(
  "tenetkit/repl/kernel-state-store/KernelStateStore",
) {}
