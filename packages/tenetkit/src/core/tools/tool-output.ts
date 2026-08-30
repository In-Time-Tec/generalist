import { Cause, Clock, Context, Effect, Function, HashMap, Layer, Option, Ref, Schema } from "effect"
import type { Success } from "./tool-executor.js"
import { sha256Text } from "../durable/canonical-json.js"
/** @experimental A bounded tool result: inline content plus optional spilled overflow references. */
export interface ToolOutput {
  readonly inline: unknown
  readonly outputPaths?: ReadonlyArray<string>
}

/** @experimental Content persisted by a tool-output store. */
export type ToolOutputContent = Success["encodedResult"]

/** @experimental A successful tool result after applying the output bound. */
export interface BoundedSuccess extends Success {
  readonly outputPaths: ReadonlyArray<string>
}

/** @experimental Stores tool-output overflow out of context. */
export interface StoreService {
  readonly put: (
    toolCallId: string,
    content: ToolOutputContent,
  ) => Effect.Effect<Option.Option<string>, ToolOutputError>
}

/** @experimental */
export class ToolOutputStore extends Context.Service<ToolOutputStore, StoreService>()(
  "tenetkit/core/tools/tool-output/ToolOutputStore",
) {}

/** @experimental */
export class ToolOutputError extends Schema.TaggedError<ToolOutputError>()("tenetkit/core/ToolOutputError", {
  message: Schema.String,
}) {}

/** @experimental */
export const layerNoop: Layer.Layer<ToolOutputStore> = Layer.succeed(
  ToolOutputStore,
  ToolOutputStore.of({ put: () => Effect.succeed(Option.none()) }),
)

/** @experimental */
export const layerMemory: Layer.Layer<ToolOutputStore> = Layer.effect(
  ToolOutputStore,
  Ref.make({ next: 0, records: HashMap.empty<string, unknown>() }).pipe(
    Effect.map((state) =>
      ToolOutputStore.of({
        put: (toolCallId, content) =>
          Ref.modify(state, ({ next, records }) => {
            const id = `mem:tool-output-${next + 1}`
            return [Option.some(id), { next: next + 1, records: HashMap.set(records, id, { toolCallId, content }) }]
          }),
      }),
    ),
  ),
)

/** @experimental */
export const layerTest = (implementation: StoreService): Layer.Layer<ToolOutputStore> =>
  Layer.succeed(ToolOutputStore, ToolOutputStore.of(implementation))

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const serialized = (value: Success["encodedResult"]): string => {
  const json = JSON.stringify(value)
  return json === undefined ? String(value) : json
}

const preview = (value: string, maxBytes: number): string => {
  const encoded = encoder.encode(value)
  let end = Math.min(encoded.byteLength, Math.floor(maxBytes))
  while (end > 0 && end < encoded.byteLength) {
    const next = encoded[end]
    if (next === undefined || (next & 0xc0) !== 0x80) break
    end -= 1
  }
  return decoder.decode(encoded.slice(0, end))
}

const BoundedInline = Schema.Struct({
  truncated: Schema.Literal(true),
  bytes: Schema.Finite.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  maxBytes: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
  digest: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
  preview: Schema.String,
})

type BoundedInline = typeof BoundedInline.Type

interface BoundedToolOutput extends ToolOutput {
  readonly inline: BoundedInline
  readonly outputPaths?: ReadonlyArray<string>
}

const BoundedToolOutput = Schema.Struct({
  inline: BoundedInline,
  outputPaths: Schema.optionalKey(Schema.Array(Schema.String)),
})

const decodeBoundedToolOutput = Schema.decodeUnknownOption(BoundedToolOutput)

const bounded = (inline: BoundedInline, outputPaths: ReadonlyArray<string>): BoundedSuccess => {
  const output: BoundedToolOutput = { inline, outputPaths }
  return { _tag: "Success", result: output, encodedResult: output, outputPaths }
}

const boundedInlineFromOriginal = (encoded: string, bytes: number, maxBytes: number): BoundedInline => ({
  truncated: true,
  bytes,
  maxBytes,
  digest: sha256Text(encoded),
  preview: preview(encoded, maxBytes),
})

const optionalStore = (
  store: StoreService,
  toolCallId: string,
  result: Success,
): Effect.Effect<
  { readonly _tag: "Stored"; readonly path: string } | { readonly _tag: "Declined" } | { readonly _tag: "Failed" }
> =>
  store.put(toolCallId, { result: result.result, encodedResult: result.encodedResult }).pipe(
    Effect.map(
      Option.match({
        onNone: () => ({ _tag: "Declined" as const }),
        onSome: (path) => ({ _tag: "Stored" as const, path }),
      }),
    ),
    Effect.catchCause((cause) => {
      const unrecoverable = cause.reasons.filter(
        (reason): reason is Cause.Die | Cause.Interrupt => Cause.isDieReason(reason) || Cause.isInterruptReason(reason),
      )
      return unrecoverable.length === 0
        ? Effect.succeed({ _tag: "Failed" as const })
        : Effect.failCause(Cause.fromReasons(unrecoverable))
    }),
  )

const observeBound = (input: {
  readonly bytes: number
  readonly maxBytes: number
  readonly truncated: boolean
  readonly digest?: string
  readonly outputPathCount: number
  readonly spill: "absent" | "stored" | "declined" | "failed"
}): Effect.Effect<void> =>
  Effect.gen(function* () {
    const attributes = {
      "tenetkit.tool.output.original_bytes": input.bytes,
      "tenetkit.tool.output.max_bytes": input.maxBytes,
      "tenetkit.tool.output.truncated": input.truncated,
      "tenetkit.tool.output.spill": input.spill,
      "tenetkit.tool.output.path_count": input.outputPathCount,
    }
    const observed =
      input.digest === undefined ? attributes : { ...attributes, "tenetkit.tool.output.digest": input.digest }
    yield* Effect.annotateCurrentSpan(observed)
    const span = yield* Effect.option(Effect.currentSpan)
    if (Option.isSome(span)) span.value.event("tenetkit.tool.output.bound", yield* Clock.currentTimeNanos, observed)
  })

/** @experimental */
export const bound: {
  (options: {
    readonly toolCallId: string
    readonly maxBytes: number
  }): (result: Success) => Effect.Effect<BoundedSuccess>
  (result: Success, options: { readonly toolCallId: string; readonly maxBytes: number }): Effect.Effect<BoundedSuccess>
} = Function.dual(2, (result: Success, options: { readonly toolCallId: string; readonly maxBytes: number }) =>
  Effect.gen(function* () {
    const decodedOutput = decodeBoundedToolOutput(result.encodedResult)
    if (Option.isSome(decodedOutput)) {
      const output = decodedOutput.value
      const outputPaths = output.outputPaths ?? []
      if (
        encoder.encode(output.inline.preview).byteLength <= output.inline.maxBytes &&
        encoder.encode(output.inline.preview).byteLength <= options.maxBytes
      ) {
        yield* observeBound({
          bytes: output.inline.bytes,
          maxBytes: output.inline.maxBytes,
          truncated: true,
          digest: output.inline.digest,
          outputPathCount: outputPaths.length,
          spill: outputPaths.length === 0 ? "absent" : "stored",
        })
        return bounded(output.inline, outputPaths)
      }
      const inline = {
        ...output.inline,
        maxBytes: options.maxBytes,
        preview: preview(output.inline.preview, options.maxBytes),
      }
      yield* observeBound({
        bytes: inline.bytes,
        maxBytes: inline.maxBytes,
        truncated: true,
        digest: inline.digest,
        outputPathCount: outputPaths.length,
        spill: outputPaths.length === 0 ? "absent" : "stored",
      })
      return bounded(inline, outputPaths)
    }

    const encoded = serialized(result.encodedResult)
    const bytes = encoder.encode(encoded).byteLength
    if (bytes <= options.maxBytes) {
      yield* observeBound({
        bytes,
        maxBytes: options.maxBytes,
        truncated: false,
        outputPathCount: 0,
        spill: "absent",
      })
      return { ...result, outputPaths: [] }
    }

    const maybeStore = yield* Effect.serviceOption(ToolOutputStore)
    if (Option.isNone(maybeStore)) {
      const inline = boundedInlineFromOriginal(encoded, bytes, options.maxBytes)
      yield* observeBound({
        bytes,
        maxBytes: options.maxBytes,
        truncated: true,
        digest: inline.digest,
        outputPathCount: 0,
        spill: "absent",
      })
      return bounded(inline, [])
    }

    const spill = yield* optionalStore(maybeStore.value, options.toolCallId, result)
    const outputPaths = spill._tag === "Stored" ? [spill.path] : []
    const inline = boundedInlineFromOriginal(encoded, bytes, options.maxBytes)
    let spillStatus: "stored" | "declined" | "failed" = "failed"
    if (spill._tag === "Stored") spillStatus = "stored"
    if (spill._tag === "Declined") spillStatus = "declined"
    yield* observeBound({
      bytes,
      maxBytes: options.maxBytes,
      truncated: true,
      digest: inline.digest,
      outputPathCount: outputPaths.length,
      spill: spillStatus,
    })

    return bounded(inline, outputPaths)
  }),
)
