import { Effect, Function, Option, Predicate, Pull, Schedule, Schema, Stream } from "effect"
import { RunEvent } from "./run/event.js"
import { CompactionInspection, isTerminal, RawUsageFact, RunInspection, RunOutcome } from "./run.js"
import { Runtime, type Interface as RuntimeInterface } from "./service.js"
import { TreeCursor, type TreeCursor as TreeCursorType } from "./tree/cursor.js"
export { TreeCursor }

export interface TreeEvent {
  readonly rootRunId: string
  readonly runId: string
  readonly parentRunId?: string
  readonly invocationId?: string
  readonly modelCallId?: string
  readonly modelAttemptId?: string
  readonly toolCallId?: string
  readonly event: RunEvent
  readonly cursor: TreeCursorType
}

interface TreeEventEncoded extends Omit<TreeEvent, "event" | "cursor"> {
  readonly event: typeof RunEvent.Encoded
  readonly cursor: typeof TreeCursor.Encoded
}

export const TreeEvent: Schema.Codec<TreeEvent, TreeEventEncoded> = Schema.Struct({
  rootRunId: Schema.String,
  runId: Schema.String,
  parentRunId: Schema.optionalKey(Schema.String),
  invocationId: Schema.optionalKey(Schema.String),
  modelCallId: Schema.optionalKey(Schema.String),
  modelAttemptId: Schema.optionalKey(Schema.String),
  toolCallId: Schema.optionalKey(Schema.String),
  event: RunEvent,
  cursor: TreeCursor,
})

export const encodeTreeEvent: {
  (
    input: TreeEvent,
    options?: import("effect/SchemaAST").ParseOptions,
  ): Effect.Effect<TreeEventEncoded, Schema.SchemaError>
  (
    options?: import("effect/SchemaAST").ParseOptions,
  ): (input: TreeEvent) => Effect.Effect<TreeEventEncoded, Schema.SchemaError>
} = Function.dual(
  (args) => Schema.is(TreeEvent)(args[0]),
  (input: TreeEvent, options?: import("effect/SchemaAST").ParseOptions) =>
    Schema.encodeEffect(TreeEvent)(input, options),
)

const isParseOptions = (
  value: TreeEventEncoded | TreePageEncoded | InspectionEncoded | import("effect/SchemaAST").ParseOptions | undefined,
): value is import("effect/SchemaAST").ParseOptions =>
  Predicate.isObject(value) &&
  ("errors" in value ||
    "onExcessProperty" in value ||
    "propertyOrder" in value ||
    "disableChecks" in value ||
    "concurrency" in value)

export function decodeTreeEvent(
  input: TreeEventEncoded,
  options?: import("effect/SchemaAST").ParseOptions,
): Effect.Effect<TreeEvent, Schema.SchemaError>
export function decodeTreeEvent(
  options?: import("effect/SchemaAST").ParseOptions,
): (input: TreeEventEncoded) => Effect.Effect<TreeEvent, Schema.SchemaError>
export function decodeTreeEvent(
  input?: TreeEventEncoded | import("effect/SchemaAST").ParseOptions,
  options?: import("effect/SchemaAST").ParseOptions,
) {
  if (input === undefined || isParseOptions(input))
    return (event: TreeEventEncoded) => Schema.decodeEffect(TreeEvent)(event, input)
  return Schema.decodeEffect(TreeEvent)(input, options)
}

export interface TreePage {
  readonly events: ReadonlyArray<TreeEvent>
  readonly cursor: TreeCursorType
  readonly hasMore: boolean
}

interface TreePageEncoded extends Omit<TreePage, "events" | "cursor"> {
  readonly events: ReadonlyArray<TreeEventEncoded>
  readonly cursor: typeof TreeCursor.Encoded
}

export const TreePage: Schema.Codec<TreePage, TreePageEncoded> = Schema.Struct({
  events: Schema.Array(TreeEvent),
  cursor: TreeCursor,
  hasMore: Schema.Boolean,
})

export const encodeTreePage: {
  (
    input: TreePage,
    options?: import("effect/SchemaAST").ParseOptions,
  ): Effect.Effect<TreePageEncoded, Schema.SchemaError>
  (
    options?: import("effect/SchemaAST").ParseOptions,
  ): (input: TreePage) => Effect.Effect<TreePageEncoded, Schema.SchemaError>
} = Function.dual(
  (args) => Schema.is(TreePage)(args[0]),
  (input: TreePage, options?: import("effect/SchemaAST").ParseOptions) => Schema.encodeEffect(TreePage)(input, options),
)

export function decodeTreePage(
  input: TreePageEncoded,
  options?: import("effect/SchemaAST").ParseOptions,
): Effect.Effect<TreePage, Schema.SchemaError>
export function decodeTreePage(
  options?: import("effect/SchemaAST").ParseOptions,
): (input: TreePageEncoded) => Effect.Effect<TreePage, Schema.SchemaError>
export function decodeTreePage(
  input?: TreePageEncoded | import("effect/SchemaAST").ParseOptions,
  options?: import("effect/SchemaAST").ParseOptions,
) {
  if (input === undefined || isParseOptions(input))
    return (page: TreePageEncoded) => Schema.decodeEffect(TreePage)(page, input)
  return Schema.decodeEffect(TreePage)(input, options)
}

export interface HistoryInput {
  readonly rootRunId: string
  readonly cursor?: TreeCursorType
  readonly limit: number
}

export interface EventsInput {
  readonly rootRunId: string
  readonly cursor?: TreeCursorType
}

export interface WatchInput extends EventsInput {
  readonly settlement?: "tree-terminal" | "root-blocked"
}

export interface TreeRunInspection {
  readonly run: RunInspection
  readonly parentRunId?: string
  readonly invocationId?: string
  readonly outcome?: RunOutcome
}

interface TreeRunInspectionEncoded extends Omit<TreeRunInspection, "run" | "outcome"> {
  readonly run: typeof RunInspection.Encoded
  readonly outcome?: typeof RunOutcome.Encoded
}

export const TreeRunInspection: Schema.Codec<TreeRunInspection, TreeRunInspectionEncoded> = Schema.Struct({
  run: RunInspection,
  parentRunId: Schema.optionalKey(Schema.String),
  invocationId: Schema.optionalKey(Schema.String),
  outcome: Schema.optionalKey(RunOutcome),
})

const InspectionBase = {
  rootRunId: Schema.String,
  cursor: TreeCursor,
  runs: Schema.Array(TreeRunInspection),
  usage: Schema.Array(RawUsageFact),
  compactions: Schema.Array(CompactionInspection),
}

interface InspectionBase {
  readonly rootRunId: string
  readonly cursor: TreeCursorType
  readonly runs: ReadonlyArray<TreeRunInspection>
  readonly usage: ReadonlyArray<RawUsageFact>
  readonly compactions: ReadonlyArray<CompactionInspection>
}

export type Inspection =
  | (InspectionBase & { readonly _tag: "Active"; readonly activeRunIds: ReadonlyArray<string> })
  | (InspectionBase & { readonly _tag: "Terminal" })

interface InspectionBaseEncoded extends Omit<InspectionBase, "cursor" | "runs" | "usage" | "compactions"> {
  readonly cursor: typeof TreeCursor.Encoded
  readonly runs: ReadonlyArray<TreeRunInspectionEncoded>
  readonly usage: ReadonlyArray<typeof RawUsageFact.Encoded>
  readonly compactions: ReadonlyArray<typeof CompactionInspection.Encoded>
}

type InspectionEncoded =
  | (InspectionBaseEncoded & { readonly _tag: "Active"; readonly activeRunIds: ReadonlyArray<string> })
  | (InspectionBaseEncoded & { readonly _tag: "Terminal" })

export const Inspection: Schema.Codec<Inspection, InspectionEncoded> = Schema.Union([
  Schema.TaggedStruct("Active", { ...InspectionBase, activeRunIds: Schema.Array(Schema.String) }),
  Schema.TaggedStruct("Terminal", InspectionBase),
])

export const encodeInspection: {
  (
    input: Inspection,
    options?: import("effect/SchemaAST").ParseOptions,
  ): Effect.Effect<InspectionEncoded, Schema.SchemaError>
  (
    options?: import("effect/SchemaAST").ParseOptions,
  ): (input: Inspection) => Effect.Effect<InspectionEncoded, Schema.SchemaError>
} = Function.dual(
  (args) => Schema.is(Inspection)(args[0]),
  (input: Inspection, options?: import("effect/SchemaAST").ParseOptions) =>
    Schema.encodeEffect(Inspection)(input, options),
)

export function decodeInspection(
  input: InspectionEncoded,
  options?: import("effect/SchemaAST").ParseOptions,
): Effect.Effect<Inspection, Schema.SchemaError>
export function decodeInspection(
  options?: import("effect/SchemaAST").ParseOptions,
): (input: InspectionEncoded) => Effect.Effect<Inspection, Schema.SchemaError>
export function decodeInspection(
  input?: InspectionEncoded | import("effect/SchemaAST").ParseOptions,
  options?: import("effect/SchemaAST").ParseOptions,
) {
  if (input === undefined || isParseOptions(input))
    return (inspection: InspectionEncoded) => Schema.decodeEffect(Inspection)(inspection, input)
  return Schema.decodeEffect(Inspection)(input, options)
}

export const history = (input: HistoryInput) => Runtime.use((runtime) => runtime.treeHistory(input))

export const inspect = (rootRunId: string) => Runtime.use((runtime) => runtime.inspectTree(rootRunId))

export const awaitTerminal = (
  rootRunId: string,
): Effect.Effect<Extract<Inspection, { readonly _tag: "Terminal" }>, import("./service.js").TreeEventsError, Runtime> =>
  Effect.suspend(() =>
    inspect(rootRunId).pipe(
      Effect.flatMap((current) =>
        current._tag === "Terminal"
          ? Effect.succeed(current)
          : events({ rootRunId, cursor: current.cursor }).pipe(
              Stream.filter(
                ({ event }) =>
                  event._tag === "RunAccepted" ||
                  event._tag === "ChildLinked" ||
                  event._tag === "RunCompleted" ||
                  event._tag === "RunFailed" ||
                  event._tag === "RunCancelled",
              ),
              Stream.runHead,
              Effect.flatMap(() => awaitTerminal(rootRunId)),
            ),
      ),
    ),
  )

const recoveryWakeups = Stream.fromSchedule(Schedule.spaced("1 second")).pipe(Stream.map(() => undefined))

const changes = (runtime: RuntimeInterface, rootRunId: string) =>
  Stream.merge(runtime.treeChanges(rootRunId), recoveryWakeups)

export const events = (input: EventsInput): Stream.Stream<TreeEvent, import("./service.js").TreeEventsError, Runtime> =>
  Stream.unwrap(
    Runtime.use((runtime) =>
      Effect.gen(function* () {
        const pullChange = yield* Stream.toPull(changes(runtime, input.rootRunId))
        return Stream.paginate(
          { cursor: input.cursor, wait: true },
          (
            state,
          ): Effect.Effect<
            readonly [ReadonlyArray<TreeEvent>, Option.Option<{ cursor: TreeCursorType; wait: boolean }>],
            import("./service.js").TreeEventsError
          > =>
            Effect.gen(function* () {
              if (state.wait) yield* pullChange.pipe(Pull.catchDone(() => Effect.void))
              const request: HistoryInput = {
                rootRunId: input.rootRunId,
                limit: 256,
              }
              const page = yield* runtime.treeHistory(
                state.cursor === undefined ? request : { ...request, cursor: state.cursor },
              )
              return [page.events, Option.some({ cursor: page.cursor, wait: !page.hasMore })] as const
            }),
        )
      }),
    ),
  )

interface TreeIndex {
  readonly runs: ReadonlyMap<string, RunInspection>
  readonly childrenByWait: ReadonlyMap<string, ReadonlyArray<RunInspection>>
}

const indexTree = (runs: ReadonlyArray<TreeRunInspection>): TreeIndex => {
  const byId = new Map<string, RunInspection>()
  const childrenByWait = new Map<string, Array<RunInspection>>()
  for (const entry of runs) {
    byId.set(entry.run.runId, entry.run)
    if (entry.parentRunId === undefined || entry.invocationId === undefined) continue
    const key = `${entry.parentRunId}\u0000${entry.invocationId}`
    const linked = childrenByWait.get(key)
    if (linked === undefined) childrenByWait.set(key, [entry.run])
    else linked.push(entry.run)
  }
  return { runs: byId, childrenByWait }
}

const canProgress = (index: TreeIndex, runId: string, memo: Map<string, boolean>): boolean => {
  const cached = memo.get(runId)
  if (cached !== undefined) return cached
  memo.set(runId, false)
  const decide = (value: boolean) => {
    memo.set(runId, value)
    return value
  }
  const run = index.runs.get(runId)
  if (run === undefined || isTerminal(run.status) || run.status === "needs-resolution") return decide(false)
  if (run.status !== "waiting") return decide(true)
  const wait = run.wait
  if (wait === undefined || wait.status !== "open") return decide(true)
  if (wait.reason._tag !== "ToolWait") return decide(false)
  const linked = index.childrenByWait.get(`${runId}\u0000${wait.waitId}`)
  if (linked === undefined) return decide(true)
  return decide(linked.some((child) => isTerminal(child.status) || canProgress(index, child.runId, memo)))
}

const isSettled = (inspection: Inspection, settlement: NonNullable<WatchInput["settlement"]>): boolean => {
  if (inspection._tag === "Terminal") return true
  if (settlement === "tree-terminal") return false
  const index = indexTree(inspection.runs)
  const memo = new Map<string, boolean>()
  return !inspection.activeRunIds.some((runId) => canProgress(index, runId, memo))
}

export const watch = (input: WatchInput): Stream.Stream<TreeEvent, import("./service.js").TreeEventsError, Runtime> =>
  Stream.unwrap(
    Runtime.use((runtime) =>
      Effect.gen(function* () {
        const settlement = input.settlement ?? "tree-terminal"
        const pullChange = yield* Stream.toPull(changes(runtime, input.rootRunId))
        return Stream.paginate(
          { cursor: input.cursor, wait: true },
          (
            state,
          ): Effect.Effect<
            readonly [ReadonlyArray<TreeEvent>, Option.Option<{ cursor: TreeCursorType; wait: boolean }>],
            import("./service.js").TreeEventsError
          > =>
            Effect.gen(function* () {
              if (state.wait) yield* pullChange.pipe(Pull.catchDone(() => Effect.void))
              const request: HistoryInput = {
                rootRunId: input.rootRunId,
                limit: 256,
              }
              const page = yield* runtime.treeHistory(
                state.cursor === undefined ? request : { ...request, cursor: state.cursor },
              )
              if (page.hasMore) {
                return [page.events, Option.some({ cursor: page.cursor, wait: false })] as const
              }
              const inspection = yield* runtime.inspectTree(input.rootRunId)
              const drained = page.cursor === inspection.cursor
              return [
                page.events,
                drained && isSettled(inspection, settlement)
                  ? Option.none()
                  : Option.some({ cursor: page.cursor, wait: drained }),
              ] as const
            }),
        )
      }),
    ),
  )
