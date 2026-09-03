import { Effect, Function, Schema, Stream } from "effect"
import { Prompt } from "effect/unstable/ai"
import packageManifest from "../../../package.json" with { type: "json" }
import { RunId, type RunSnapshot } from "../../runtime/run.js"
import type { RunEvent } from "../../runtime/run/event.js"
import type { RecordRewardError, Service as RuntimeService } from "../../runtime/service.js"
import {
  fromJournal,
  type FromJournalError,
  type JournalReader,
  type Trajectory as LinearTrajectory,
} from "../../trajectory/index.js"
import { fromTurn as modelOperation, ModelCall, TokenId } from "./model-call.js"
import { RewardInvalid, type Service as RewardService } from "./reward.js"

export * as Reward from "./reward.js"
export { ModelCall } from "./model-call.js"

/** @experimental One completed durable tool operation. */
export const ToolCall = Schema.TaggedStruct("ToolCall", {
  operationId: Schema.String,
  turn: Schema.Finite,
  tool: Schema.String,
  isFailure: Schema.Boolean,
})
/** @experimental */
export type ToolCall = typeof ToolCall.Type

/** @experimental One durable child-link operation. */
export const ChildLink = Schema.TaggedStruct("ChildLink", {
  operationId: Schema.String,
  childRunId: RunId,
  selection: Schema.String,
})
/** @experimental */
export type ChildLink = typeof ChildLink.Type

/** @experimental One applied durable compaction operation. */
export const Compaction = Schema.TaggedStruct("Compaction", {
  operationId: Schema.String,
  turn: Schema.Finite,
  checkpointId: Schema.String,
  kind: Schema.Literals(["microcompact", "summarize"]),
})
/** @experimental */
export type Compaction = typeof Compaction.Type

/** @experimental One terminal durable Run operation. */
export const Terminal = Schema.TaggedStruct("Terminal", {
  operationId: Schema.String,
  status: Schema.Literals(["succeeded", "failed", "cancelled"]),
})
/** @experimental */
export type Terminal = typeof Terminal.Type

/** @experimental Operations represented in an RL trajectory DAG. */
export const Operation = Schema.Union([ModelCall, ToolCall, ChildLink, Compaction, Terminal])
/** @experimental */
export type Operation = typeof Operation.Type

/** @experimental One journal operation in a trajectory DAG. */
export const Node = Schema.Struct({
  id: Schema.String,
  runId: RunId,
  sequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  operation: Operation,
})
/** @experimental */
export type Node = typeof Node.Type

/** @experimental The journal fact relating two trajectory operations. */
export const Edge = Schema.Struct({
  from: Schema.String,
  to: Schema.String,
  type: Schema.Literals(["parent", "fork", "child", "compaction"]),
})
/** @experimental */
export type Edge = typeof Edge.Type

const DagTypeId: unique symbol = Symbol.for("generalist/unstable/rl-export/Dag")

/** @experimental A point-in-time operation DAG projected from Runtime journals. */
export interface Dag {
  readonly [DagTypeId]: typeof DagTypeId
  readonly rootRunId: string
  readonly nodes: ReadonlyArray<Node>
  readonly edges: ReadonlyArray<Edge>
  readonly leaves: ReadonlyArray<string>
}

/** @experimental Cross-driver Runtime methods required by `dag`. */
export interface DagRuntime extends JournalReader {
  readonly recordReward: RuntimeService["recordReward"]
}

interface DagState {
  readonly runtime: DagRuntime
  readonly taskset: string
  readonly nodes: ReadonlyMap<string, Node>
  readonly inbound: ReadonlyMap<string, Edge>
  readonly messages: ReadonlyMap<string, Prompt.Prompt>
  readonly trajectories: ReadonlyMap<string, LinearTrajectory>
}

interface Relation {
  readonly type: "fork" | "child"
  readonly parentRunId: string
  readonly sequence: number
}

interface PendingRun {
  readonly runId: string
  readonly relation?: Relation
}

const dagStates = new WeakMap<Dag, DagState>()

const terminalOperation = (event: RunEvent): Terminal | undefined => {
  if (event._tag === "RunCompleted") return { _tag: "Terminal", operationId: event.eventId, status: "succeeded" }
  if (event._tag === "RunFailed") return { _tag: "Terminal", operationId: event.eventId, status: "failed" }
  if (event._tag === "RunCancelled") return { _tag: "Terminal", operationId: event.eventId, status: "cancelled" }
  return undefined
}

const cachedReader = (
  runtime: DagRuntime,
  runId: string,
  snapshot: RunSnapshot,
  events: ReadonlyArray<RunEvent>,
): JournalReader => ({
  snapshot: (requested) => (requested === runId ? Effect.succeed(snapshot) : runtime.snapshot(requested)),
  history: (input) => (input.runId === runId ? Effect.succeed(events) : runtime.history(input)),
  sessionEntry: runtime.sessionEntry,
  resolveModelResponse: runtime.resolveModelResponse,
})

interface ProjectionState {
  readonly nodes: Array<Node>
  readonly edges: Array<Edge>
  readonly latestMessages: Map<string, { readonly nodeId: string; readonly messages: Prompt.Prompt }>
  readonly trajectories: Map<string, LinearTrajectory>
  readonly references: Map<string, Array<{ readonly id: string; readonly sequence: number }>>
}

const anchorFor = (state: ProjectionState, relation: Relation): string | undefined =>
  state.references.get(relation.parentRunId)?.findLast((node) => node.sequence <= relation.sequence)?.id

const addNode = (
  state: ProjectionState,
  event: RunEvent,
  operation: Operation,
  messages: Prompt.Prompt,
  relation: Relation | undefined,
  previous: string | undefined,
): string => {
  const node: Node = { id: event.eventId, runId: event.runId, sequence: event.sequence, operation }
  state.nodes.push(node)
  state.latestMessages.set(node.runId, { nodeId: node.id, messages })
  const references = state.references.get(event.runId) ?? []
  references.push({ id: node.id, sequence: node.sequence })
  state.references.set(event.runId, references)
  const anchor = previous ?? (relation === undefined ? undefined : anchorFor(state, relation))
  if (anchor !== undefined) {
    let type: Edge["type"] = operation._tag === "Compaction" ? "compaction" : "parent"
    if (previous === undefined && relation !== undefined) type = relation.type
    state.edges.push({
      from: anchor,
      to: node.id,
      type,
    })
  }
  return node.id
}

const isCopiedForkEvent = (relation: Relation | undefined, event: RunEvent): boolean =>
  relation?.type === "fork" && event.sequence <= relation.sequence

const projectRun = Effect.fn("RlExport.projectRun")(function* (
  runtime: DagRuntime,
  pending: PendingRun,
  state: ProjectionState,
): Effect.fn.Return<ReadonlyArray<PendingRun>, FromJournalError> {
  const snapshot = yield* runtime.snapshot(pending.runId)
  const events = yield* runtime.history({ runId: pending.runId, limit: snapshot.cursor + 1 })
  const trajectory = yield* fromJournal(cachedReader(runtime, pending.runId, snapshot, events), pending.runId)
  state.trajectories.set(pending.runId, trajectory)
  const relation = pending.relation
  if (relation?.type === "fork") {
    const inherited = state.references.get(relation.parentRunId)?.filter((node) => node.sequence <= relation.sequence)
    if (inherited !== undefined) state.references.set(pending.runId, [...inherited])
  }
  const discovered: Array<PendingRun> = snapshot.run.branches.map((branch) => ({
    runId: branch.runId,
    relation: { type: "fork", parentRunId: pending.runId, sequence: branch.forkedAt },
  }))
  let previous: string | undefined
  let modelIndex = 0
  let messages = trajectory.input
  for (const event of events) {
    const copied = isCopiedForkEvent(pending.relation, event)
    if (event._tag === "ModelResponseCommitted" || event._tag === "ModelResponseInterrupted") {
      const turn = trajectory.turns[modelIndex++]!
      messages = Prompt.concat(turn.prompt, Prompt.fromResponseParts(turn.response.content))
      if (!copied) previous = addNode(state, event, modelOperation(event, turn), messages, pending.relation, previous)
      continue
    }
    if (event._tag === "ToolExecutionCompleted") {
      messages = Prompt.concat(messages, Prompt.fromResponseParts([event.result]))
      if (!copied) {
        previous = addNode(
          state,
          event,
          {
            _tag: "ToolCall",
            operationId: event.call.id,
            turn: event.turn,
            tool: event.call.name,
            isFailure: event.result.isFailure,
          },
          messages,
          pending.relation,
          previous,
        )
      }
      continue
    }
    if (copied) continue
    if (event._tag === "ChildLinked") {
      previous = addNode(
        state,
        event,
        {
          _tag: "ChildLink",
          operationId: event.invocationId,
          childRunId: event.childRunId,
          selection: event.selection,
        },
        messages,
        pending.relation,
        previous,
      )
      discovered.push({
        runId: event.childRunId,
        relation: { type: "child", parentRunId: pending.runId, sequence: event.sequence },
      })
      continue
    }
    if (event._tag === "CompactionApplied") {
      previous = addNode(
        state,
        event,
        {
          _tag: "Compaction",
          operationId: event.compactionId,
          turn: event.turn,
          checkpointId: event.checkpointId,
          kind: event.kind,
        },
        messages,
        pending.relation,
        previous,
      )
      continue
    }
    const terminal = terminalOperation(event)
    if (terminal !== undefined) previous = addNode(state, event, terminal, messages, pending.relation, previous)
  }
  return discovered
})

/** @experimental Project a root Run, retained forks, and linked child Runs into one operation DAG. */
export const dag = Effect.fn("RlExport.dag")(function* (
  runtime: DagRuntime,
  runId: string,
): Effect.fn.Return<Dag, FromJournalError> {
  const state: ProjectionState = {
    nodes: [],
    edges: [],
    latestMessages: new Map(),
    trajectories: new Map(),
    references: new Map(),
  }
  const pending: Array<PendingRun> = [{ runId }]
  const visited = new Set<string>()
  for (let index = 0; index < pending.length; index++) {
    const next = pending[index]!
    if (visited.has(next.runId)) continue
    visited.add(next.runId)
    pending.push(...(yield* projectRun(runtime, next, state)))
  }
  const outgoing = new Set(state.edges.map((edge) => edge.from))
  const leaves = state.nodes.filter((node) => !outgoing.has(node.id)).map((node) => node.id)
  const value: Dag = {
    [DagTypeId]: DagTypeId,
    rootRunId: runId,
    nodes: state.nodes,
    edges: state.edges,
    leaves,
  }
  const leafSet = new Set(leaves)
  dagStates.set(value, {
    runtime,
    taskset: state.trajectories.get(runId)!.agent,
    nodes: new Map(state.nodes.map((node) => [node.id, node])),
    inbound: new Map(state.edges.map((edge) => [edge.to, edge])),
    messages: new Map(
      [...state.latestMessages.values()]
        .filter(({ nodeId }) => leafSet.has(nodeId))
        .map(({ nodeId, messages }) => [nodeId, messages]),
    ),
    trajectories: state.trajectories,
  })
  return value
})

/** @experimental Branches included in verifiers v1 export. */
export interface IncludeOptions {
  readonly logprobs: boolean
  readonly compactionBranches: boolean
  readonly childBranches: boolean
  /** Accepted for forward compatibility; speculation has no journal branches until issue #358 lands. */
  readonly speculationLosers: boolean
}

/** @experimental Verifiers v1 JSONL export options. */
export interface ExportOptions<R = never, E = never> {
  readonly format: "verifiers-v1"
  readonly include: IncludeOptions
  readonly reward: RewardService<R, E>
}

/** @experimental One flattened verifiers v1 training record. */
export const VerifiersV1Record = Schema.Struct({
  messages: Schema.Array(Prompt.Message),
  tokens: Schema.optionalKey(Schema.Array(TokenId)),
  logprobs: Schema.optionalKey(Schema.NullOr(Schema.Array(Schema.Finite))),
  reward: Schema.Finite,
  env: Schema.Struct({ taskset: Schema.String, harness: Schema.String }),
})
/** @experimental */
export type VerifiersV1Record = typeof VerifiersV1Record.Type

interface DagPath {
  readonly nodes: ReadonlyArray<Node>
  readonly edges: ReadonlyArray<Edge>
}

const pathTo = (state: DagState, leaf: string): DagPath => {
  const reversedNodes: Array<Node> = []
  const reversedEdges: Array<Edge> = []
  let current: string | undefined = leaf
  while (current !== undefined) {
    reversedNodes.push(state.nodes.get(current)!)
    const edge = state.inbound.get(current)
    if (edge === undefined) break
    reversedEdges.push(edge)
    current = edge.from
  }
  return { nodes: reversedNodes.toReversed(), edges: reversedEdges.toReversed() }
}

const includedPath = (path: DagPath, include: IncludeOptions): boolean =>
  (include.childBranches || !path.edges.some((edge) => edge.type === "child")) &&
  (include.compactionBranches ||
    (!path.edges.some((edge) => edge.type === "compaction") &&
      !path.nodes.some((node) => node.operation._tag === "Compaction")))

const tokenFields = (path: DagPath, include: IncludeOptions): Pick<VerifiersV1Record, "tokens" | "logprobs"> => {
  if (!include.logprobs) return {}
  const lastChild = path.edges.findLastIndex((edge) => edge.type === "child")
  const modelCalls = path.nodes
    .slice(lastChild + 1)
    .map((node) => node.operation)
    .filter((operation): operation is ModelCall => operation._tag === "ModelCall")
  const tokens =
    modelCalls.length > 0 && modelCalls.every((operation) => operation.tokens !== undefined)
      ? modelCalls.flatMap((operation) => operation.tokens!)
      : undefined
  const logprobs =
    modelCalls.length > 0 && modelCalls.every((operation) => operation.logprobs !== undefined)
      ? modelCalls.flatMap((operation) => operation.logprobs!)
      : null
  return tokens === undefined ? { logprobs } : { tokens, logprobs }
}

const textEncoder = new TextEncoder()
const recordSchema = Schema.fromJsonString(VerifiersV1Record)

const encodeLeaf = <R, E>(
  state: DagState,
  leaf: string,
  path: DagPath,
  options: ExportOptions<R, E>,
): Effect.Effect<Uint8Array, E | RewardInvalid | RecordRewardError | Schema.SchemaError, R> =>
  Effect.gen(function* () {
    const node = state.nodes.get(leaf)!
    const trajectory = state.trajectories.get(node.runId)!
    const messages = state.messages.get(leaf)!
    const value = yield* options.reward.evaluate({ leaf, runId: node.runId, messages, trajectory })
    if (!Number.isFinite(value)) return yield* RewardInvalid.make({ leaf, source: options.reward.source, value })
    yield* state.runtime.recordReward({ runId: node.runId, leaf, value, source: options.reward.source })
    const record: VerifiersV1Record = {
      messages: messages.content,
      ...tokenFields(path, options.include),
      reward: value,
      env: { taskset: state.taskset, harness: `generalist@${packageManifest.version}` },
    }
    const line = yield* Schema.encodeEffect(recordSchema)(record)
    return textEncoder.encode(`${line}\n`)
  })

function* includedPaths(
  dagValue: Dag,
  state: DagState,
  include: IncludeOptions,
): Generator<{ readonly leaf: string; readonly path: DagPath }> {
  for (const leaf of dagValue.leaves) {
    const path = pathTo(state, leaf)
    if (includedPath(path, include)) yield { leaf, path }
  }
}

const exportVerifiers: {
  <R, E>(
    options: ExportOptions<R, E>,
  ): (dagValue: Dag) => Stream.Stream<Uint8Array, E | RewardInvalid | RecordRewardError | Schema.SchemaError, R>
  <R, E>(
    dagValue: Dag,
    options: ExportOptions<R, E>,
  ): Stream.Stream<Uint8Array, E | RewardInvalid | RecordRewardError | Schema.SchemaError, R>
} = Function.dual(2, <R, E>(dagValue: Dag, options: ExportOptions<R, E>) => {
  if (options.format !== "verifiers-v1") throw new TypeError("Unsupported RL trajectory export format")
  const state = dagStates.get(dagValue)!
  return Stream.fromIterable(includedPaths(dagValue, state, options.include)).pipe(
    Stream.mapEffect(({ leaf, path }) => encodeLeaf(state, leaf, path, options)),
  )
})

export { exportVerifiers as export }
