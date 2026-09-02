import {
  ExecutableManifest as CoreExecutableManifest,
  ExecutableRef as CoreExecutableRef,
  type PinnedExecutable as CorePinnedExecutable,
  type ProfileBinding as CoreProfileBinding,
  decode as decodeCore,
  encode as encodeCore,
  make as makeCore,
  makeTest as makeTestCore,
} from "../../core/durable/manifest/executable-manifest.js"
import { Function, Schema } from "effect"

/** Complete closed executable profile registry and entry closure. */
export type ExecutableManifest = CoreExecutableManifest
/** One globally pinned child profile available by selection name. */
export type ProfileBinding = CoreProfileBinding
/** Encoded complete closed executable Agent graph. */
type ExecutableManifestEncoded = typeof CoreExecutableManifest.Encoded

/** Complete closed executable Agent graph. */
export const ExecutableManifest: Schema.Codec<ExecutableManifest, ExecutableManifestEncoded> = CoreExecutableManifest

/** Durable reference to one exact executable closure and active Agent. */
export const ExecutableRef: typeof CoreExecutableRef = CoreExecutableRef
export type ExecutableRef = CoreExecutableRef

/** Executable closure paired with its constructor-owned reference. */
export type PinnedExecutable = CorePinnedExecutable
/** Encoded executable closure paired with its reference. */
interface PinnedExecutableEncoded {
  readonly ref: typeof ExecutableRef.Encoded
  readonly manifest: ExecutableManifestEncoded
}

/** Paired executable authority boundary. */
export const PinnedExecutable: Schema.Codec<PinnedExecutable, PinnedExecutableEncoded> = Schema.Struct({
  ref: ExecutableRef,
  manifest: ExecutableManifest,
})

/** Construct, validate, canonicalize, and pin a complete executable closure. */
export const make: typeof makeCore = makeCore
/** Construct an exact static executable fixture. */
export const makeTest: {
  (revision?: string): (name: string) => CorePinnedExecutable
  (name: string, revision?: string): CorePinnedExecutable
} = Function.dual(2, (name: string, revision?: string) => makeTestCore(name, revision))
export const encode: typeof encodeCore = encodeCore
export const decode: typeof decodeCore = decodeCore
