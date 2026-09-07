import { Schema, type Effect } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Inheritance } from "../../core/agent/lifecycle/fan-out.js"
import { ArtifactAppendReceipt, ArtifactHead, ArtifactUpdate, Attribution, RangeOperation, Version } from "../../core/artifact.js"
import { BudgetLimits } from "../../core/durable/run-budget.js"
import { ProgramBudget } from "../../core/durable/manifest/program-manifest.js"
import { Ref as MediaRef } from "../../media/ref.js"
import { FanOutJoin, FanOutReceipt, FanOutRemainder } from "../../runtime/child/fan-out.js"
import { FanOutMemberOrigin } from "../../runtime/child/fan-out-internal.js"
import { ExecutableManifest, ExecutableRef } from "../../runtime/executable/manifest.js"
import { ExecutableRegistration } from "../../runtime/executable/registration.js"
import { AgentName, DirectoryEntry } from "../../runtime/execution/agent/directory.js"
import { ExecutionCheckpoint, ExecutionSuspension } from "../../runtime/execution/state.js"
import { Message, Metadata } from "../../runtime/messaging/message.js"
import { RunId, RunInspection, RunReceipt } from "../../runtime/run.js"
import { AdmissionPolicy, ExecutionContinuation, MessageSource, SteeringReceipt } from "../../runtime/run/steering.js"
import type { Service } from "../../runtime/run/store.js"
import { RunWait } from "../../runtime/run/wait.js"
import { HostSession } from "../../runtime/session/host.js"
import { TreePolicy } from "../../runtime/tree/policy.js"
import { ExecutionClaim } from "./runtime-state/schema.js"

const AdmitSendInput = Schema.Struct({
  message: Message,
  executableRef: ExecutableRef,
  executableManifest: ExecutableManifest,
  registrations: Schema.Array(ExecutableRegistration),
  runId: Schema.optionalKey(Schema.String),
  treePolicy: Schema.optionalKey(TreePolicy),
  budget: Schema.optionalKey(BudgetLimits),
})

const InitialChildInput = Schema.Struct({
  invocationId: Schema.String,
  idempotencyKey: Schema.String,
  selection: Schema.String,
  prompt: Prompt.Prompt,
  sessionId: Schema.String,
  messageId: Schema.optionalKey(Schema.String),
  correlationId: Schema.optionalKey(Schema.String),
  metadata: Schema.optionalKey(Metadata),
})

const InitialFanOutMember = Schema.Struct({
  key: Schema.String,
  selection: Schema.String,
  label: Schema.optionalKey(Schema.String),
  prompt: Prompt.Prompt,
  sessionId: Schema.optionalKey(Schema.String),
  metadata: Schema.optionalKey(Metadata),
  origin: Schema.optionalKey(FanOutMemberOrigin),
  inherit: Schema.optionalKey(Inheritance),
})

const InitialFanOutInput = Schema.Struct({
  idempotencyKey: Schema.String,
  members: Schema.Array(InitialFanOutMember),
  concurrency: Schema.optionalKey(Schema.Number),
  join: FanOutJoin,
  remainder: FanOutRemainder,
})

const AdmitStartInput = Schema.Struct({
  ...AdmitSendInput.fields,
  initialChildren: Schema.Array(InitialChildInput),
  initialFanOuts: Schema.Array(InitialFanOutInput),
})

const StartReceipt = Schema.Struct({
  runId: RunId,
  messageId: Schema.String,
  acceptedSequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  duplicate: Schema.Boolean,
  childRunIds: Schema.Array(Schema.String),
  fanOuts: Schema.Array(FanOutReceipt),
})

const AdmitSpawnInput = Schema.Struct({
  parentRunId: Schema.String,
  invocationId: Schema.String,
  selection: Schema.String,
  label: Schema.optionalKey(Schema.String),
  origin: Schema.optionalKey(FanOutMemberOrigin),
  prompt: Prompt.Prompt,
  sessionId: Schema.optionalKey(Schema.String),
  idempotencyKey: Schema.optionalKey(Schema.String),
  messageId: Schema.optionalKey(Schema.String),
  correlationId: Schema.optionalKey(Schema.String),
  metadata: Schema.optionalKey(Metadata),
  message: Message,
})

const ProgramChild = Schema.Struct({
  childRunId: Schema.String,
  invocationId: Schema.String,
  message: Message,
  executableRef: ExecutableRef,
  executableManifest: ExecutableManifest,
  registrations: Schema.Array(ExecutableRegistration),
})

const AdmitProgramChildInput = Schema.Struct({
  ...ExecutionClaim.fields,
  ...ProgramChild.fields,
})

const AdmitProgramChildAndSuspendInput = Schema.Struct({
  ...ExecutionClaim.fields,
  children: Schema.NonEmptyArray(ProgramChild),
  waits: Schema.Array(RunWait),
  suspension: ExecutionSuspension,
  checkpoint: Schema.optionalKey(ExecutionCheckpoint),
  continuation: Schema.optionalKey(Schema.NullOr(ExecutionContinuation)),
})

const AdmitSteeringInput = Schema.Struct({
  runId: Schema.String,
  idempotencyKey: Schema.String,
  digest: Schema.String,
  prompt: Prompt.Prompt,
  policy: AdmissionPolicy,
  from: MessageSource,
  addressed: Schema.optionalKey(Message),
})

const SteeringAdmission = Schema.Struct({
  receipt: SteeringReceipt,
  duplicate: Schema.Boolean,
})

/** Normalized fan-out admission shared with atomic Program agent admission. */
export const AdmitFanOutInput = Schema.Struct({
  fanOutId: Schema.String,
  parentRunId: Schema.String,
  idempotencyKey: Schema.String,
  members: Schema.Array(Schema.Struct({
    ordinal: Schema.Number,
    key: Schema.String,
    childRunId: Schema.String,
    selection: Schema.String,
    label: Schema.optionalKey(Schema.String),
    prompt: Prompt.Prompt,
    sessionId: Schema.String,
    metadata: Metadata,
    origin: Schema.optionalKey(FanOutMemberOrigin),
    inherit: Inheritance,
  })),
  concurrency: Schema.optionalKey(Schema.Number),
  budgetDivisor: Schema.optionalKey(Schema.Number),
  join: FanOutJoin,
  remainder: FanOutRemainder,
})

const ArtifactBranchSource = Schema.Struct({
  version: Version,
  snapshot: MediaRef,
  branch: Schema.optionalKey(Schema.String),
})

const ArtifactFork = Schema.Struct({
  artifact: Schema.String,
  crdt: Schema.String,
  branch: Schema.String,
  source: ArtifactBranchSource,
})

const ArtifactAppend = Schema.Struct({
  artifact: Schema.String,
  commandId: Schema.String.check(Schema.isNonEmpty()),
  crdt: Schema.String,
  expected: Version,
  base: Version,
  operation: RangeOperation,
  attribution: Attribution,
  update: Schema.Uint8ArrayFromBase64,
  snapshot: MediaRef,
  branch: Schema.optionalKey(Schema.String),
  source: Schema.optionalKey(ArtifactBranchSource),
})
export const artifactAppendIdentity = (input: {
  readonly artifact: string
  readonly commandId: string
  readonly branch?: string
}): string => JSON.stringify([input.artifact, input.branch ?? "", input.commandId])

export const artifactAppendCommandId = (input: {
  readonly artifact: string
  readonly commandId: string
  readonly branch?: string
}): string => `appendArtifact:${artifactAppendIdentity(input)}`


type Method =
  | "admitSend"
  | "admitStart"
  | "activate"
  | "extendBudget"
  | "admitSpawn"
  | "admitProgramChild"
  | "admitProgramChildAndSuspend"
  | "admitSteering"
  | "admitRollback"
  | "fork"
  | "rewind"
  | "admitFanOut"
  | "registerAgentName"
  | "acknowledge"
  | "recordReward"
  | "createHostSession"
  | "ensureArtifact"
  | "forkArtifact"
  | "appendArtifact"

type CommandReceipt<K extends Method> = K extends "appendArtifact"
  ? ArtifactAppendReceipt
  : Effect.Success<ReturnType<Service[K]>>

type Commands = {
  readonly [K in Method]: {
    readonly tag: K
    readonly input: Schema.Codec<Readonly<Parameters<Service[K]>>, unknown>
    readonly receipt: Schema.Codec<CommandReceipt<K>, unknown>
    readonly identity: (input: Readonly<Parameters<Service[K]>>) => string
  }
}

export const commands: Commands = {
  admitSend: {
    tag: "admitSend" as const,
    input: Schema.Tuple([AdmitSendInput]),
    receipt: RunReceipt,
    identity: ([input]) => JSON.stringify([input.message.to, input.message.sessionId, input.message.idempotencyKey]),
  },
  admitStart: {
    tag: "admitStart" as const,
    input: Schema.Tuple([
      AdmitStartInput,
      Schema.optionalKey(Schema.UndefinedOr(Schema.Struct({ activate: Schema.optionalKey(Schema.Boolean) }))),
    ]),
    receipt: StartReceipt,
    identity: ([input]) => JSON.stringify([input.message.to, input.message.sessionId, input.message.idempotencyKey]),
  },
  activate: {
    tag: "activate" as const,
    input: Schema.Tuple([Schema.Struct({ runId: Schema.String, commandId: Schema.String.check(Schema.isNonEmpty()) })]),
    receipt: RunInspection,
    identity: ([input]) => JSON.stringify([input.runId, input.commandId]),
  },
  extendBudget: {
    tag: "extendBudget" as const,
    input: Schema.Tuple([Schema.Struct({ runId: Schema.String, delta: BudgetLimits, commandId: Schema.String })]),
    receipt: Schema.Void,
    identity: ([input]) => JSON.stringify([input.runId, input.commandId]),
  },
  admitSpawn: {
    tag: "admitSpawn" as const,
    input: Schema.Tuple([AdmitSpawnInput]),
    receipt: RunReceipt,
    identity: ([input]) => JSON.stringify([input.parentRunId, input.message.sessionId, input.message.idempotencyKey]),
  },
  admitProgramChild: {
    tag: "admitProgramChild" as const,
    input: Schema.Tuple([AdmitProgramChildInput]),
    receipt: RunReceipt,
    identity: ([input]) => JSON.stringify([input.runId, input.attemptFence, input.childRunId]),
  },
  admitProgramChildAndSuspend: {
    tag: "admitProgramChildAndSuspend" as const,
    input: Schema.Tuple([AdmitProgramChildAndSuspendInput]),
    receipt: Schema.Array(RunReceipt),
    identity: ([input]) => JSON.stringify([input.runId, input.attemptFence, input.children.map((child) => child.childRunId)]),
  },
  admitSteering: {
    tag: "admitSteering" as const,
    input: Schema.Tuple([AdmitSteeringInput]),
    receipt: SteeringAdmission,
    identity: ([input]) => JSON.stringify([input.runId, input.idempotencyKey]),
  },
  admitRollback: {
    tag: "admitRollback" as const,
    input: Schema.Tuple([Schema.Struct({ ...AdmitSteeringInput.fields, branchRunId: Schema.String })]),
    receipt: SteeringAdmission,
    identity: ([input]) => JSON.stringify([input.runId, input.idempotencyKey]),
  },
  fork: {
    tag: "fork" as const,
    input: Schema.Tuple([Schema.Struct({
      commandId: Schema.String.check(Schema.isNonEmpty()),
      runId: Schema.String,
      newRunId: Schema.String,
      atSequence: Schema.Number,
      budget: Schema.optionalKey(BudgetLimits),
      programBudget: Schema.optionalKey(ProgramBudget),
      substitute: Schema.optionalKey(Schema.Struct({ operationId: Schema.String, result: Schema.Unknown })),
    })]),
    receipt: RunReceipt,
    identity: ([input]) => input.commandId,
  },
  rewind: {
    tag: "rewind" as const,
    input: Schema.Tuple([Schema.Struct({
      commandId: Schema.String.check(Schema.isNonEmpty()),
      runId: Schema.String,
      branchRunId: Schema.String,
      toSequence: Schema.Number,
      budget: Schema.optionalKey(BudgetLimits),
    })]),
    receipt: Schema.Void,
    identity: ([input]) => input.commandId,
  },
  admitFanOut: {
    tag: "admitFanOut" as const,
    input: Schema.Tuple([AdmitFanOutInput]),
    receipt: FanOutReceipt,
    identity: ([input]) => JSON.stringify([input.parentRunId, input.idempotencyKey]),
  },
  registerAgentName: {
    tag: "registerAgentName" as const,
    input: Schema.Tuple([Schema.Struct({ runId: Schema.String, name: AgentName })]),
    receipt: DirectoryEntry,
    identity: ([input]) => JSON.stringify([input.runId, input.name]),
  },
  acknowledge: {
    tag: "acknowledge" as const,
    input: Schema.Tuple([Schema.Struct({ runId: Schema.String, sequence: Schema.Number })]),
    receipt: Schema.Void,
    identity: ([input]) => JSON.stringify([input.runId, input.sequence]),
  },
  recordReward: {
    tag: "recordReward" as const,
    input: Schema.Tuple([Schema.Struct({
      runId: Schema.String,
      leaf: Schema.String,
      value: Schema.Number,
      source: Schema.String,
      commandId: Schema.String,
    })]),
    receipt: Schema.Void,
    identity: ([input]) => JSON.stringify([input.runId, input.commandId]),
  },
  createHostSession: {
    tag: "createHostSession" as const,
    input: Schema.Tuple([Schema.Struct({ id: Schema.String, title: Schema.optionalKey(Schema.String) })]),
    receipt: HostSession,
    identity: ([input]) => input.id,
  },
  ensureArtifact: {
    tag: "ensureArtifact" as const,
    input: Schema.Tuple([Schema.Struct({ artifact: Schema.String, crdt: Schema.String, snapshot: MediaRef })]),
    receipt: ArtifactHead,
    identity: ([input]) => input.artifact,
  },
  forkArtifact: {
    tag: "forkArtifact" as const,
    input: Schema.Tuple([ArtifactFork]),
    receipt: ArtifactHead,
    identity: ([input]) => JSON.stringify([input.artifact, input.branch]),
  },
  appendArtifact: {
    tag: "appendArtifact" as const,
    input: Schema.Tuple([ArtifactAppend]),
    receipt: ArtifactAppendReceipt,
    identity: ([input]) => artifactAppendIdentity(input),
  },
} satisfies Commands
