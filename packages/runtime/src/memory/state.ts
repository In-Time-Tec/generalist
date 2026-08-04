import type { Queue } from "effect"
import type { Address } from "../address.js"
import type { AgentRef } from "../agent-ref.js"
import type { Message } from "../message.js"
import type { RunReceipt, RunStatus } from "../run.js"
import type { RunEvent } from "../run-event.js"
import type { CursorExpired, RuntimeUnavailable, SubscriberLagged } from "../errors.js"
import type { OperationRecord } from "../sql/operations.js"
import type { AgentEvent, DurableDriver } from "@batonfx/core"
import type { Prompt } from "effect/unstable/ai"
import type { RunWait } from "../run-wait.js"
import type { ExecutionContinuation, SteeringEntry } from "../steering.js"
import type { FanOutJoin, FanOutMemberResult, FanOutRemainder, FanOutStatus } from "../fan-out.js"
import type { TreeEvent } from "../tree.js"

export type SubscriberError = SubscriberLagged | CursorExpired | RuntimeUnavailable
export type SubscriberQueue = Queue.Queue<RunEvent, SubscriberError>

export interface IdempotencyEntry {
  readonly digest: string
  readonly receipt: RunReceipt
}

export interface StoredRun {
  readonly runId: string
  readonly status: RunStatus
  readonly agent: AgentRef
  readonly address: Address
  readonly message: Message
  readonly rootRunId: string
  readonly parentRunId?: string
  readonly invocationId?: string
  readonly activeWaitId?: string
  readonly wait?: RunWait
  readonly respondedWaitIds: ReadonlySet<string>
  readonly lastSequence: number
  readonly attempt: number
  readonly attemptFence: number
  readonly ownerId?: string
  readonly checkpoint?: DurableDriver.DriverCheckpoint
  readonly suspension?: AgentEvent.AgentSuspended
  readonly transcript?: Prompt.Prompt
  readonly continuation?: ExecutionContinuation
  readonly cancellationRequested: boolean
  readonly cancelReason?: string
  readonly terminalEventId?: string
  readonly children: ReadonlyArray<string>
  readonly events: ReadonlyArray<RunEvent>
  readonly subscribers: ReadonlyMap<number, SubscriberQueue>
  readonly steering: ReadonlyArray<SteeringEntry & { readonly consumedOperationId?: string }>
}

export interface Lane {
  readonly queue: ReadonlyArray<string>
  readonly acceptedSequence: number
}

export interface MemoryState {
  readonly closed: boolean
  readonly nextRunCounter: number
  readonly nextSubscriberId: number
  readonly nextOperationCounter: number
  readonly nextSteeringCounter: number
  readonly runs: ReadonlyMap<string, StoredRun>
  readonly treeRoots: ReadonlyMap<string, TreeRoot>
  readonly lanes: ReadonlyMap<string, Lane>
  readonly idempotency: ReadonlyMap<string, IdempotencyEntry>
  readonly fanOuts: ReadonlyMap<string, StoredFanOut>
  readonly operations: ReadonlyMap<string, OperationRecord>
  readonly agentRefs: ReadonlyMap<string, AgentRef>
  readonly addressBindings: ReadonlyMap<string, AgentRef>
  readonly subscriberQueueCapacity: number
}

export interface TreeRoot {
  readonly earliestPosition: number
  readonly lastPosition: number
  readonly events: ReadonlyArray<TreeEvent>
}

export interface StoredFanOut {
  readonly fanOutId: string
  readonly parentRunId: string
  readonly idempotencyKey: string
  readonly digest: string
  readonly status: FanOutStatus
  readonly join: FanOutJoin
  readonly remainder: FanOutRemainder
  readonly concurrency: number
  readonly members: ReadonlyArray<FanOutMemberResult>
}

export const laneKey = (address: Address, sessionId: string): string => `${address}\0${sessionId}`

export const agentKey = (agent: AgentRef): string => `${agent.id}\0${agent.version}\0${agent.digest}`

export const idempotencyKey = (address: Address, sessionId: string, key: string): string =>
  `${address}\0${sessionId}\0${key}`

export const emptyState = (input: {
  readonly agentRefs: ReadonlyMap<string, AgentRef>
  readonly addressBindings: ReadonlyMap<string, AgentRef>
  readonly subscriberQueueCapacity: number
}): MemoryState => ({
  closed: false,
  nextRunCounter: 1,
  nextSubscriberId: 1,
  nextOperationCounter: 1,
  nextSteeringCounter: 1,
  runs: new Map(),
  treeRoots: new Map(),
  lanes: new Map(),
  idempotency: new Map(),
  fanOuts: new Map(),
  operations: new Map(),
  agentRefs: input.agentRefs,
  addressBindings: input.addressBindings,
  subscriberQueueCapacity: input.subscriberQueueCapacity,
})

export const operationMapKey = (runId: string, operationId: string): string => `${runId}\0${operationId}`

export const operationKeyMapKey = (runId: string, operationKey: string): string => `key:${runId}\0${operationKey}`
