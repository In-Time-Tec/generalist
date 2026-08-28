import { Cause, Context, Effect, Function, HashMap, Layer, Option, Ref, Schema } from "effect"
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
export interface StoreInterface {
  readonly put: (
    toolCallId: string,
    content: ToolOutputContent,
  ) => Effect.Effect<Option.Option<string>, ToolOutputError>
}

/** @experimental */
export class ToolOutputStore extends Context.Service<ToolOutputStore, StoreInterface>()(
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
export const layerTest = (implementation: StoreInterface): Layer.Layer<ToolOutputStore> =>
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

const boundedFromOriginal = (
  encoded: string,
  bytes: number,
  maxBytes: number,
  outputPaths: ReadonlyArray<string>,
): BoundedSuccess =>
  bounded(
    { truncated: true, bytes, maxBytes, digest: sha256Text(encoded), preview: preview(encoded, maxBytes) },
    outputPaths,
  )

const optionalStore = (
  store: StoreInterface,
  toolCallId: string,
  result: Success,
): Effect.Effect<Option.Option<string>> =>
  store.put(toolCallId, { result: result.result, encodedResult: result.encodedResult }).pipe(
    Effect.catchCause((cause) => {
      const unrecoverable = cause.reasons.filter(
        (reason): reason is Cause.Die | Cause.Interrupt => Cause.isDieReason(reason) || Cause.isInterruptReason(reason),
      )
      return unrecoverable.length === 0
        ? Effect.succeed(Option.none())
        : Effect.failCause(Cause.fromReasons(unrecoverable))
    }),
  )

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
        return bounded(output.inline, outputPaths)
      }
      return bounded(
        { ...output.inline, maxBytes: options.maxBytes, preview: preview(output.inline.preview, options.maxBytes) },
        outputPaths,
      )
    }

    const encoded = serialized(result.encodedResult)
    const bytes = encoder.encode(encoded).byteLength
    if (bytes <= options.maxBytes) return { ...result, outputPaths: [] }

    const maybeStore = yield* Effect.serviceOption(ToolOutputStore)
    if (Option.isNone(maybeStore)) return boundedFromOriginal(encoded, bytes, options.maxBytes, [])

    const path = yield* optionalStore(maybeStore.value, options.toolCallId, result)
    if (Option.isNone(path)) return boundedFromOriginal(encoded, bytes, options.maxBytes, [])

    return boundedFromOriginal(encoded, bytes, options.maxBytes, [path.value])
  }),
)
