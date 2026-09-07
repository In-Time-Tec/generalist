import { Effect, Schema } from "effect"
import { builtinModules } from "node:module"
import { isSqlGraphEntry } from "./package-smoke-config.js"

const MetafilePath = Schema.String.check(Schema.isNonEmpty())
const Bytes = Schema.Finite.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
const ImportKind = Schema.Literals([
  "entry-point",
  "import-statement",
  "require-call",
  "dynamic-import",
  "require-resolve",
  "import-rule",
  "composes-from",
  "url-token",
])
const Attributes = Schema.Record(Schema.String, Schema.String)
const BundleMetafile = Schema.fromJsonString(
  Schema.Struct({
    inputs: Schema.Record(
      MetafilePath,
      Schema.Struct({
        bytes: Bytes,
        imports: Schema.Array(
          Schema.Struct({
            path: MetafilePath,
            kind: ImportKind,
            external: Schema.optionalKey(Schema.Boolean),
            original: Schema.optionalKey(MetafilePath),
            with: Schema.optionalKey(Attributes),
          }),
        ),
        format: Schema.optionalKey(Schema.Literals(["cjs", "esm"])),
        with: Schema.optionalKey(Attributes),
      }),
    ),
    outputs: Schema.Record(
      MetafilePath,
      Schema.Struct({
        bytes: Bytes,
        inputs: Schema.Record(MetafilePath, Schema.Struct({ bytesInOutput: Bytes })),
        imports: Schema.Array(
          Schema.Struct({
            path: MetafilePath,
            kind: Schema.Union([ImportKind, Schema.Literal("file-loader")]),
            external: Schema.optionalKey(Schema.Boolean),
          }),
        ),
        exports: Schema.Array(Schema.String),
        entryPoint: Schema.optionalKey(MetafilePath),
        cssBundle: Schema.optionalKey(MetafilePath),
      }),
    ),
  }),
)

class BundleGraphFailed extends Schema.TaggedError<BundleGraphFailed>()("generalist/scripts/BundleGraphFailed", {
  message: Schema.String,
}) {}

const validateReferences = Effect.fn("PackageSmoke.validateBundleReferences")(function* (
  metadata: typeof BundleMetafile.Type,
) {
  for (const input of Object.values(metadata.inputs)) {
    for (const item of input.imports) {
      if (item.external !== true && !Object.hasOwn(metadata.inputs, item.path)) {
        return yield* BundleGraphFailed.make({ message: `Bundle metafile references an unknown input: ${item.path}` })
      }
    }
  }
  for (const output of Object.values(metadata.outputs)) {
    if (output.entryPoint !== undefined && !Object.hasOwn(metadata.inputs, output.entryPoint)) {
      return yield* BundleGraphFailed.make({
        message: `Bundle metafile references an unknown entrypoint: ${output.entryPoint}`,
      })
    }
    if (output.cssBundle !== undefined && !Object.hasOwn(metadata.outputs, output.cssBundle)) {
      return yield* BundleGraphFailed.make({
        message: `Bundle metafile references an unknown CSS output: ${output.cssBundle}`,
      })
    }
    for (const item of output.imports) {
      if (item.external !== true && !Object.hasOwn(metadata.outputs, item.path)) {
        return yield* BundleGraphFailed.make({ message: `Bundle metafile references an unknown output: ${item.path}` })
      }
    }
  }
})

export const shippedBundleGraph = Effect.fn("PackageSmoke.shippedBundleGraph")(function* (source: string) {
  const metadata = yield* Schema.decodeEffect(BundleMetafile)(source, { onExcessProperty: "error" })
  if (Object.keys(metadata.inputs).length === 0 || Object.keys(metadata.outputs).length === 0) {
    return yield* BundleGraphFailed.make({ message: "Bundle metafile must contain inputs and outputs" })
  }
  yield* validateReferences(metadata)
  const graph = new Set<string>()
  for (const output of Object.values(metadata.outputs)) {
    for (const [filename, input] of Object.entries(output.inputs)) {
      if (!Object.hasOwn(metadata.inputs, filename)) {
        return yield* BundleGraphFailed.make({ message: `Bundle output references an unknown input: ${filename}` })
      }
      if (input.bytesInOutput > 0) graph.add(filename)
    }
    for (const item of output.imports) graph.add(item.path)
    if (output.cssBundle !== undefined) graph.add(output.cssBundle)
  }
  return graph
})

const nodeBuiltins = new Set(builtinModules.map((specifier) => specifier.replace(/^node:/, "").split("/")[0]))

export const isForbiddenWorkerRuntime = (item: string): boolean => {
  const normalized = item.replaceAll("\\", "/").toLowerCase()
  const bare = normalized.replace(/^node:/, "").split("/")[0] ?? normalized
  return (
    normalized.startsWith("node:") ||
    normalized.startsWith("bun:") ||
    nodeBuiltins.has(bare) ||
    normalized.includes("node-built-in-modules:") ||
    isSqlGraphEntry(normalized) ||
    normalized.includes("@aws-sdk") ||
    normalized.includes("@smithy") ||
    normalized.includes("unenv/runtime/node/")
  )
}

export const isForbiddenTransportRuntime = ({
  profile,
  item,
}: {
  readonly profile: string
  readonly item: string
}): boolean => {
  const normalized = item.replaceAll("\\", "/").toLowerCase()
  if (isSqlGraphEntry(normalized)) return true
  if (profile === "durability-s3") return false
  if (normalized.includes("@aws-sdk") || normalized.includes("@smithy")) return true
  return profile === "core-runtime" && /\/durability\/(?:s3|r2)\.js$/.test(normalized)
}
