import { Function } from "effect"
import type { Queue } from "effect"
import type { Address } from "../address.js"
import type { ExecutableManifest, ExecutableRef, PinnedExecutable } from "../executable-manifest.js"
import type { Message } from "../message.js"
import type { RunReceipt, RunStatus } from "../run.js"
import type { RunEvent, SteeringDiscardReason } from "../run-event.js"
import type { CursorExpired, RuntimeUnavailable, SubscriberLagged } from "../errors.js"
import type { OperationRecord } from "../sql/operations.js"
import type { ExecutionCheckpoint, ExecutionSuspension } from "../execution-state.js"
import type { RunWait } from "../run-wait.js"
import type { ExecutionContinuation, SteeringEntry } from "../steering.js"
import type { FanOutJoin, FanOutMemberResult, FanOutRemainder, FanOutStatus } from "../fan-out.js"
import type { TreeEvent } from "../tree.js"
import type { ProgramOperationRecord, ProgramRunState } from "../program-store.js"
import type { ExecutableRegistration } from "../executable-registration.js"
import type { PendingRunOutcome } from "../run-store.js"
import type { TreePolicy } from "../tree-policy.js"
import type { ChildReadiness } from "../child-readiness.js"
import type { MailboxEntry } from "../mailbox.js"
import type { Session } from "tenetkit"

export type SubscriberError = SubscriberLagged | CursorExpired | RuntimeUnavailable
export type SubscriberQueue = Queue.Queue<RunEvent, SubscriberError>
export type TreeSubscriberQueue = Queue.Queue<void, RuntimeUnavailable>

/** @experimental Internal publication deferred until the owning memory transition commits. */
export interface MemoryPublication {
  readonly runId: string
  readonly event: RunEvent
  readonly lastDeliveredSequence: number
  readonly subscribers: ReadonlyMap<number, SubscriberQueue>
  readonly treeSubscribers: ReadonlyMap<number, TreeSubscriberQueue>
}

export interface IdempotencyEntry {
  readonly digest: string
  readonly executable: PinnedExecutable
  readonly receipt: RunReceipt
}

export interface StoredRun {
  readonly runId: string
  readonly status: RunStatus
  readonly executableRef: ExecutableRef
  readonly executableManifest: ExecutableManifest
  readonly address: Address
  readonly message: Message
  readonly rootRunId: string
  readonly depth: number
  readonly treePolicy: TreePolicy
  readonly parentRunId?: string
  readonly childReadiness?: ChildReadiness
  readonly invocationId?: string
  readonly activeWaitId?: string
  readonly wait?: RunWait
  readonly respondedWaitIds: ReadonlySet<string>
  readonly lastSequence: number
  readonly attempt: number
  readonly attemptFence: number
  readonly ownerId?: string
  readonly checkpoint?: ExecutionCheckpoint
  readonly suspension?: ExecutionSuspension
  readonly continuation?: ExecutionContinuation
  readonly cancellationRequested: boolean
  readonly cancelReason?: string
  readonly terminalEventId?: string
  readonly pendingOutcome?: PendingRunOutcome
  readonly children: ReadonlyArray<string>
  readonly events: ReadonlyArray<RunEvent>
  readonly subscribers: ReadonlyMap<number, SubscriberQueue>
  readonly steering: ReadonlyArray<
    SteeringEntry & { readonly consumedOperationId?: string; readonly discardedReason?: SteeringDiscardReason }
  >
  readonly registrations: ReadonlyArray<ExecutableRegistration>
}

export interface Lane {
  readonly queue: ReadonlyArray<string>
  readonly acceptedSequence: number
}

export interface MemorySession {
  readonly entries: ReadonlyMap<string, Session.Entry>
  readonly order: ReadonlyArray<string>
  readonly leaf: string | null
  readonly counter: number
}

export interface MemoryState {
  readonly closed: boolean
  readonly nextRunCounter: number
  readonly nextSubscriberId: number
  readonly nextOperationCounter: number
  readonly nextSteeringCounter: number
  readonly nextMessageCounter: number
  readonly runs: ReadonlyMap<string, StoredRun>
  readonly sessions: ReadonlyMap<string, MemorySession>
  readonly treeRoots: ReadonlyMap<string, TreeRoot>
  readonly lanes: ReadonlyMap<string, Lane>
  readonly idempotency: ReadonlyMap<string, IdempotencyEntry>
  readonly registrationCatalog: ReadonlyMap<string, { readonly digest: string; readonly value: ExecutableRegistration }>
  readonly fanOuts: ReadonlyMap<string, StoredFanOut>
  readonly operations: ReadonlyMap<string, OperationRecord>
  readonly programStates: ReadonlyMap<string, ProgramRunState>
  readonly programOperations: ReadonlyMap<string, ProgramOperationRecord>
  readonly addressBindings: ReadonlyMap<string, { readonly ref: ExecutableRef; readonly manifest: ExecutableManifest }>
  readonly messages: ReadonlyMap<string, MailboxEntry>
  readonly agentNames: ReadonlyMap<string, string>
  readonly subscriberQueueCapacity: number
  readonly publications: ReadonlyArray<MemoryPublication>
}

export interface TreeRoot {
  readonly earliestPosition: number
  readonly lastPosition: number
  readonly events: ReadonlyArray<TreeEvent>
  readonly subscribers: ReadonlyMap<number, TreeSubscriberQueue>
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

export const laneKey: {
  (sessionId: string): (address: Address) => string
  (address: Address, sessionId: string): string
} = Function.dual(2, (address: Address, sessionId: string): string => `${address}\0${sessionId}`)

export const idempotencyKey: {
  (sessionId: string, key: string): (address: Address) => string
  (address: Address, sessionId: string, key: string): string
} = Function.dual(3, (address: Address, sessionId: string, key: string): string => `${address}\0${sessionId}\0${key}`)

export const emptyState = (input: {
  readonly addressBindings: MemoryState["addressBindings"]
  readonly subscriberQueueCapacity: number
}): MemoryState => ({
  closed: false,
  nextRunCounter: 1,
  nextSubscriberId: 1,
  nextOperationCounter: 1,
  nextSteeringCounter: 1,
  nextMessageCounter: 1,
  runs: new Map(),
  sessions: new Map(),
  treeRoots: new Map(),
  lanes: new Map(),
  idempotency: new Map(),
  registrationCatalog: new Map(),
  fanOuts: new Map(),
  operations: new Map(),
  programStates: new Map(),
  programOperations: new Map(),
  addressBindings: input.addressBindings,
  messages: new Map(),
  agentNames: new Map(),
  subscriberQueueCapacity: input.subscriberQueueCapacity,
  publications: [],
})

export const operationMapKey: {
  (operationId: string): (runId: string) => string
  (runId: string, operationId: string): string
} = Function.dual(2, (runId: string, operationId: string): string => `${runId}\0${operationId}`)

export const agentNameKey: {
  (name: string): (scope: string) => string
  (scope: string, name: string): string
} = Function.dual(2, (scope: string, name: string): string => `${scope}\0${name}`)

export const operationKeyMapKey: {
  (operationKey: string): (runId: string) => string
  (runId: string, operationKey: string): string
} = Function.dual(2, (runId: string, operationKey: string): string => `key:${runId}\0${operationKey}`)
