import { Context, Effect, Function, HashMap, Layer, Option, Ref, Schema } from "effect"
import { type Success } from "./tool-executor.js"
/** @experimental A bounded tool result: inline content plus optional spilled overflow references. */
export interface ToolOutput {
  readonly inline: unknown
  readonly outputPaths?: ReadonlyArray<string>
}

/** @experimental Stores tool-output overflow out of context. */
export interface StoreInterface {
  readonly put: (toolCallId: string, content: unknown) => Effect.Effect<Option.Option<string>, ToolOutputError>
}

/** @experimental */
export class ToolOutputStore extends Context.Service<ToolOutputStore, StoreInterface>()(
  "@batonfx/core/tool-output/ToolOutputStore",
) {}

/** @experimental */
export class ToolOutputError extends Schema.TaggedErrorClass<ToolOutputError>()("@batonfx/core/ToolOutputError", {
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
export const testLayer = (implementation: StoreInterface): Layer.Layer<ToolOutputStore> =>
  Layer.succeed(ToolOutputStore, ToolOutputStore.of(implementation))

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const serialized = (value: unknown): string => {
  const json = JSON.stringify(value)
  return json === undefined ? String(value) : json
}

const preview = (value: string, maxBytes: number): string => decoder.decode(encoder.encode(value).slice(0, maxBytes))

/** @experimental */
export const bound: {
  (options: {
    readonly toolCallId: string
    readonly maxBytes: number
  }): (result: Success) => Effect.Effect<Success, ToolOutputError>
  (
    result: Success,
    options: { readonly toolCallId: string; readonly maxBytes: number },
  ): Effect.Effect<Success, ToolOutputError>
} = Function.dual(2, (result: Success, options: { readonly toolCallId: string; readonly maxBytes: number }) =>
  Effect.gen(function* () {
    const encoded = serialized(result.encodedResult)
    const bytes = encoder.encode(encoded).byteLength
    if (bytes <= options.maxBytes) return result

    const maybeStore = yield* Effect.serviceOption(ToolOutputStore)
    if (Option.isNone(maybeStore)) return result

    const path = yield* maybeStore.value.put(options.toolCallId, {
      result: result.result,
      encodedResult: result.encodedResult,
    })
    if (Option.isNone(path)) return result

    const output: ToolOutput = {
      inline: {
        truncated: true,
        bytes,
        maxBytes: options.maxBytes,
        preview: preview(encoded, options.maxBytes),
      },
      outputPaths: [path.value],
    }
    return { _tag: "Success", result: output, encodedResult: output }
  }),
)
