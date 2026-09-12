import { Context, Effect, Layer, Schema } from "effect"
import { dual } from "effect/Function"
import { Prompt } from "effect/unstable/ai"
import { RunId } from "../durable/run-id.js"
import { ActionableTaggedError, errorHint } from "../error-hint.js"

export type Metadata = Readonly<Record<string, typeof Schema.Unknown.Type>>

export interface Key {
  readonly agent: string
  readonly subject: string
}
export const OperationRef = Schema.Struct({
  runId: RunId,
  turn: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})
export type OperationRef = typeof OperationRef.Type
export const Version = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))
export type Version = typeof Version.Type
export type ItemPart = Prompt.UserMessagePart
export interface Item {
  readonly id: string
  readonly content: ReadonlyArray<ItemPart>
  readonly metadata?: Metadata
}
export interface RecallInput {
  readonly key: Key
  readonly turn: number
  readonly prompt: Prompt.Prompt
}
export interface RememberInput {
  readonly key: Key
  readonly turn: number
  readonly transcript: Prompt.Prompt
  readonly terminal: boolean
  readonly entryId?: string
  readonly supersedes?: Version
  readonly evidence: ReadonlyArray<OperationRef>
}
export interface ForgetInput {
  readonly key: Key
  readonly id?: string | undefined
}
export interface HistoryEntry {
  readonly version: Version
  readonly text: string
  readonly evidence: ReadonlyArray<OperationRef>
  readonly supersedes?: Version
  readonly appliedAt: string
}
export interface RevertInput {
  readonly to: Version
}
export class MemoryError extends ActionableTaggedError<MemoryError>()("generalist/core/MemoryError", {
  reason: Schema.optionalKey(
    Schema.Literals(["embedding", "vector-store", "language-model", "version", "unsupported"]),
  ),
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
  hint: errorHint("Inspect reason and cause, restore the failing memory dependency, then retry the operation."),
}) {}
export interface Service {
  readonly recall: (input: RecallInput) => Effect.Effect<ReadonlyArray<Item>, MemoryError>
  readonly remember: (input: RememberInput) => Effect.Effect<void, MemoryError>
  readonly forget: (input: ForgetInput) => Effect.Effect<void, MemoryError>
  readonly history: (entryId: string) => Effect.Effect<ReadonlyArray<HistoryEntry>, MemoryError>
  readonly revert: (entryId: string, input: RevertInput) => Effect.Effect<void, MemoryError>
}
export class Memory extends Context.Service<Memory, Service>()("generalist/core/context/memory") {}

const noop: Service = {
  recall: () => Effect.succeed([]),
  remember: (input) =>
    input.entryId === undefined && input.supersedes === undefined
      ? Effect.void
      : Effect.fail(MemoryError.make({ reason: "unsupported", message: "The no-op Memory does not retain versions" })),
  forget: () => Effect.void,
  history: () => Effect.succeed([]),
  revert: () =>
    Effect.fail(MemoryError.make({ reason: "unsupported", message: "The no-op Memory does not retain versions" })),
}

const owners = (services: ReadonlyArray<Service>, entryId: string) =>
  Effect.forEach(services, (service) => service.history(entryId)).pipe(
    Effect.map((histories) => services.filter((_, index) => (histories[index]?.length ?? 0) > 0)),
  )
export const merge: {
  (second: Service): (first: Service) => Service
  (first: Service, second: Service): Service
} = dual(
  2,
  (first: Service, second: Service): Service => ({
    recall: (input) =>
      Effect.all([first.recall(input), second.recall(input)]).pipe(
        Effect.map(([firstItems, secondItems]) => [...firstItems, ...secondItems]),
      ),
    remember: (input) => {
      if (input.entryId === undefined || input.supersedes === undefined) {
        return Effect.all([first.remember(input), second.remember(input)], { discard: true })
      }
      return owners([first, second], input.entryId).pipe(
        Effect.flatMap((matching) =>
          matching.length === 0
            ? Effect.fail(
                MemoryError.make({
                  reason: "version",
                  message: `Memory entry ${input.entryId} does not exist`,
                }),
              )
            : Effect.forEach(matching, (service) => service.remember(input), { discard: true }),
        ),
      )
    },
    forget: (input) => Effect.all([first.forget(input), second.forget(input)], { discard: true }),
    history: (entryId) =>
      Effect.all([first.history(entryId), second.history(entryId)]).pipe(
        Effect.map(([firstHistory, secondHistory]) => [...firstHistory, ...secondHistory]),
      ),
    revert: (entryId, input) =>
      owners([first, second], entryId).pipe(
        Effect.flatMap((matching) =>
          matching.length === 0
            ? Effect.fail(MemoryError.make({ reason: "version", message: `Memory entry ${entryId} does not exist` }))
            : Effect.forEach(matching, (service) => service.revert(entryId, input), { discard: true }),
        ),
      ),
  }),
)

/** Memory implementation that recalls and records nothing. */
export const layerNoop: Layer.Layer<Memory> = Layer.succeed(Memory, Memory.of(noop))
export const layerTest = (implementation: Service): Layer.Layer<Memory> =>
  Layer.succeed(Memory, Memory.of(implementation))
