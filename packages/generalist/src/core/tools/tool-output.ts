import { Cause, Clock, Context, Effect, Function, HashMap, Layer, Option, Ref, Schema } from "effect"
import type { Success } from "./tool-executor.js"
import { sha256Text } from "../durable/canonical-json.js"
import { ActionableTaggedError, errorHint } from "../error-hint.js"
/** A bounded tool result: inline content plus optional spilled overflow references. */
export interface Output {
  readonly inline: unknown
  readonly outputPaths?: ReadonlyArray<string>
}

/** Content persisted by a tool-output store. */
type OutputContent = Success["encodedResult"]

/** A successful tool result after applying the output bound. */
export interface BoundedSuccess extends Success {
  readonly outputPaths: ReadonlyArray<string>
}
export class Store extends Context.Service<
  Store,
  {
    readonly put: (toolCallId: string, content: OutputContent) => Effect.Effect<Option.Option<string>, Error>
  }
>()("generalist/core/tools/tool-output/Store") {}
export class Error extends ActionableTaggedError<Error>()("generalist/core/ToolOutputError", {
  message: Schema.String,
  hint: errorHint("Restore the tool-output store or reduce the result size, then retry persistence."),
}) {}
export const layerNoop: Layer.Layer<Store> = Layer.succeed(
  Store,
  Store.of({ put: () => Effect.succeed(Option.none()) }),
)
export const layerMemory: Layer.Layer<Store> = Layer.effect(
  Store,
  Ref.make({ next: 0, records: HashMap.empty<string, unknown>() }).pipe(
    Effect.map((state) =>
      Store.of({
        put: (toolCallId, content) =>
          Ref.modify(state, ({ next, records }) => {
            const id = `mem:tool-output-${next + 1}`
            return [Option.some(id), { next: next + 1, records: HashMap.set(records, id, { toolCallId, content }) }]
          }),
      }),
    ),
  ),
)
export const layerTest = (implementation: Store["Service"]): Layer.Layer<Store> =>
  Layer.succeed(Store, Store.of(implementation))

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

interface BoundedOutput extends Output {
  readonly inline: BoundedInline
  readonly outputPaths?: ReadonlyArray<string>
}

const BoundedOutput = Schema.Struct({
  inline: BoundedInline,
  outputPaths: Schema.optionalKey(Schema.Array(Schema.String)),
})

const decodeBoundedOutput = Schema.decodeUnknownOption(BoundedOutput)

const bounded = (inline: BoundedInline, outputPaths: ReadonlyArray<string>): BoundedSuccess => {
  const output: BoundedOutput = { inline, outputPaths }
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
  store: Store["Service"],
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
      "generalist.tool.output.original_bytes": input.bytes,
      "generalist.tool.output.max_bytes": input.maxBytes,
      "generalist.tool.output.truncated": input.truncated,
      "generalist.tool.output.spill": input.spill,
      "generalist.tool.output.path_count": input.outputPathCount,
    }
    const observed =
      input.digest === undefined ? attributes : { ...attributes, "generalist.tool.output.digest": input.digest }
    yield* Effect.annotateCurrentSpan(observed)
    const span = yield* Effect.option(Effect.currentSpan)
    if (Option.isSome(span)) span.value.event("generalist.tool.output.bound", yield* Clock.currentTimeNanos, observed)
  })
export const bound: {
  (options: {
    readonly toolCallId: string
    readonly maxBytes: number
  }): (result: Success) => Effect.Effect<BoundedSuccess>
  (result: Success, options: { readonly toolCallId: string; readonly maxBytes: number }): Effect.Effect<BoundedSuccess>
} = Function.dual(2, (result: Success, options: { readonly toolCallId: string; readonly maxBytes: number }) =>
  Effect.gen(function* () {
    const decodedOutput = decodeBoundedOutput(result.encodedResult)
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

    const maybeStore = yield* Effect.serviceOption(Store)
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
