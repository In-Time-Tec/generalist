import { Schema } from "effect"
import { CapabilityPin, type ToolPin, makeTool } from "../pin.js"

export const ToolManifest = Schema.Struct({
  version: Schema.Literal("1"),
  name: Schema.String.check(Schema.isNonEmpty()),
  tool: CapabilityPin,
  input: CapabilityPin,
  output: CapabilityPin,
  failure: CapabilityPin,
  replay: Schema.Literals(["never", "provider-idempotent"]),
  policy: Schema.optionalKey(CapabilityPin),
})
export type ToolManifest = typeof ToolManifest.Type

export interface PinnedTool {
  readonly pin: ToolPin
  readonly manifest: ToolManifest
}

export const make = (input: Omit<ToolManifest, "version"> & { readonly version?: "1" }): PinnedTool => {
  const manifest = Schema.decodeSync(ToolManifest, { onExcessProperty: "error" })({ ...input, version: "1" })
  return { manifest, pin: makeTool(manifest) }
}
