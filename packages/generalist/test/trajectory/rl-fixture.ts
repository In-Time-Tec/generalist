import { Effect } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import { Agent } from "../../src/index.js"
import type { RunSnapshot } from "../../src/runtime/run.js"
import type { CompletedModelResponse, RewardInput, RunEvent } from "../../src/runtime/run/event.js"
import type { DagRuntime } from "../../src/unstable/rl-export/index.js"
import { pinnedTestExecutable } from "../runtime/run/identity.js"

export const runIds = {
  root: "run:rl:root",
  fork: "run:rl:fork",
  child: "run:rl:child",
} as const

const executable = pinnedTestExecutable(Agent.make({ name: "rl-golden" }))
const usage = Response.Usage.make({ inputTokens: { total: 2 }, outputTokens: { total: 1 } })

const response = (
  text: string,
  tokenData?: { readonly tokens?: ReadonlyArray<number>; readonly logprobs?: ReadonlyArray<number> },
): CompletedModelResponse => {
  const finish = { reason: "stop" as const, usage, response: undefined }
  if (tokenData !== undefined) Object.assign(finish, { metadata: { generalist: tokenData } })
  return {
    content: [Response.makePart("text", { text }), Response.makePart("finish", finish)],
    usage,
    finishReason: "stop",
  }
}

const rootResponse = response("root")
const forkResponse = response("fork")
const childResponse = response("child")

const base = (runId: string, rootRunId: string, depth: number) => ({
  specVersion: "1" as const,
  runId,
  executableRef: executable.ref,
  attemptId: `${runId}:attempt:1`,
  rootRunId,
  depth,
  occurredAt: "2026-09-01T00:00:00.000Z",
})

const modelEvent = (input: {
  readonly runId: string
  readonly rootRunId: string
  readonly eventId: string
  readonly sequence: number
  readonly turn: number
  readonly modelCallId: string
  readonly sessionId: string
  readonly parentId: string
  readonly entryId: string
  readonly depth?: number
  readonly parentRunId?: string
}): RunEvent => {
  const event = {
    ...base(input.runId, input.rootRunId, input.depth ?? 0),
    _tag: "ModelResponseCommitted" as const,
    eventId: input.eventId,
    sequence: input.sequence,
    turn: input.turn,
    operationKey: `model:${input.turn}`,
    modelCallId: input.modelCallId,
    modelAttemptId: `${input.modelCallId}:attempt:0`,
    attempt: 0,
    sessionId: input.sessionId,
    sessionParentId: input.parentId,
    sessionEntryId: input.entryId,
    budgetCharge: 3,
    digest: `${input.modelCallId}:digest`,
    usage,
    finishReason: "stop" as const,
  }
  if (input.parentRunId !== undefined) Object.assign(event, { parentRunId: input.parentRunId })
  return event
}

const completed = (runId: string, rootRunId: string, sequence: number, sessionId: string, depth = 0): RunEvent => {
  const event = {
    ...base(runId, rootRunId, depth),
    _tag: "RunCompleted" as const,
    eventId: `${runId}:terminal`,
    sequence,
    result: { text: runId, turns: 1, session: { sessionId, leafId: null } },
  }
  if (depth > 0) Object.assign(event, { parentRunId: rootRunId })
  return event
}

const rootModel = modelEvent({
  runId: runIds.root,
  rootRunId: runIds.root,
  eventId: `${runIds.root}:model:0`,
  sequence: 1,
  turn: 0,
  modelCallId: "call:root",
  sessionId: "session:root",
  parentId: "input:root",
  entryId: "response:root",
})
const forkCopiedModel = modelEvent({
  runId: runIds.fork,
  rootRunId: runIds.fork,
  eventId: `${runIds.fork}:model:copied`,
  sequence: 1,
  turn: 0,
  modelCallId: "call:root",
  sessionId: "session:root",
  parentId: "input:root",
  entryId: "response:root",
})
const forkModel = modelEvent({
  runId: runIds.fork,
  rootRunId: runIds.fork,
  eventId: `${runIds.fork}:model:1`,
  sequence: 2,
  turn: 1,
  modelCallId: "call:fork",
  sessionId: "session:root",
  parentId: "response:root",
  entryId: "response:fork",
})
const childModel = modelEvent({
  runId: runIds.child,
  rootRunId: runIds.root,
  eventId: `${runIds.child}:model:0`,
  sequence: 1,
  turn: 0,
  modelCallId: "call:child",
  sessionId: "session:child",
  parentId: "input:child",
  entryId: "response:child",
  depth: 1,
  parentRunId: runIds.root,
})

const events = new Map<string, ReadonlyArray<RunEvent>>([
  [
    runIds.root,
    [
      rootModel,
      {
        ...base(runIds.root, runIds.root, 0),
        _tag: "CompactionApplied",
        eventId: `${runIds.root}:compaction`,
        sequence: 2,
        deliveryId: "delivery:compaction",
        turn: 0,
        compactionId: "compaction:root",
        checkpointId: "checkpoint:root",
        kind: "summarize",
        appliedAt: 2,
        commit: { compactionId: "compaction:root", checkpointId: "checkpoint:root" },
      },
      {
        ...base(runIds.root, runIds.root, 0),
        _tag: "ChildLinked",
        eventId: `${runIds.root}:child-link`,
        sequence: 3,
        childRunId: runIds.child,
        invocationId: "invoke:child",
        selection: "worker",
        prompt: Prompt.make("child task"),
        childDepth: 1,
        readiness: "ready",
        inherit: Agent.defaultInheritance,
      },
      completed(runIds.root, runIds.root, 4, "session:root"),
    ],
  ],
  [runIds.fork, [forkCopiedModel, forkModel, completed(runIds.fork, runIds.fork, 3, "session:root")]],
  [runIds.child, [childModel, completed(runIds.child, runIds.root, 2, "session:child", 1)]],
])

const inspection = (runId: string, rootRunId: string, lastSequence: number, depth: number): RunSnapshot["run"] => {
  const run = {
    runId,
    status: "succeeded" as const,
    executableRef: executable.ref,
    executableManifest: executable.manifest,
    depth,
    treePolicy: { maxDepth: 8, maxSubagents: 32 },
    waits: [],
    lastSequence,
    durability: "durable" as const,
    branches: runId === runIds.root ? [{ runId: runIds.fork, forkedAt: 1 }] : [],
  }
  if (depth > 0 && runId !== rootRunId) Object.assign(run, { parentRunId: rootRunId })
  return run
}

const snapshot = (
  runId: string,
  rootRunId: string,
  lastSequence: number,
  depth: number,
  gates: RunSnapshot["gates"],
): RunSnapshot => ({
  run: inspection(runId, rootRunId, lastSequence, depth),
  cursor: lastSequence,
  turn: 1,
  outcome: {
    _tag: "Succeeded",
    result: { text: runId, turns: 1, session: { sessionId: `session:${runId}`, leafId: null } },
    eventId: `${runId}:terminal`,
    occurredAt: "2026-09-01T00:00:01.000Z",
  },
  usageFacts: [],
  budget: {},
  compactions:
    runId === runIds.root
      ? [
          {
            _tag: "Applied",
            runId,
            turn: 0,
            compactionId: "compaction:root",
            startedAt: 1,
            trigger: "threshold",
            checkpointId: "checkpoint:root",
            appliedAt: 2,
            kind: "summarize",
            commit: { compactionId: "compaction:root", checkpointId: "checkpoint:root" },
          },
        ]
      : [],
  gates,
})

const snapshots = new Map<string, RunSnapshot>([
  [runIds.root, snapshot(runIds.root, runIds.root, 4, 0, [{ name: "quality", verdict: "pass", evidence: null }])],
  [runIds.fork, snapshot(runIds.fork, runIds.fork, 3, 0, [{ name: "quality", verdict: "fail", evidence: null }])],
  [runIds.child, snapshot(runIds.child, runIds.root, 2, 1, [{ name: "quality", verdict: "pass", evidence: null }])],
])

const entries = new Map([
  [
    "input:root",
    { _tag: "Message" as const, id: "input:root", parentId: null, message: Prompt.make("root task").content[0]! },
  ],
  [
    "response:root",
    {
      _tag: "ModelResponse" as const,
      id: "response:root",
      parentId: "input:root",
      content: rootResponse.content,
    },
  ],
  [
    "input:child",
    { _tag: "Message" as const, id: "input:child", parentId: null, message: Prompt.make("child task").content[0]! },
  ],
])

export const makeRuntime = (overrides: Partial<Record<string, CompletedModelResponse>> = {}) => {
  const rewards: Array<RewardInput> = []
  const responses = new Map<string, CompletedModelResponse>([
    ["call:root", overrides["call:root"] ?? rootResponse],
    ["call:fork", overrides["call:fork"] ?? forkResponse],
    ["call:child", overrides["call:child"] ?? childResponse],
  ])
  const runtime = {
    snapshot: (runId: string) => Effect.succeed(snapshots.get(runId)!),
    history: (input: { readonly runId: string }) => Effect.succeed(events.get(input.runId)!),
    sessionEntry: (input: { readonly entryId: string }) => Effect.succeed(entries.get(input.entryId)!),
    resolveModelResponse: (event: { readonly modelCallId: string }) =>
      Effect.succeed(responses.get(event.modelCallId)!),
    recordReward: (input: RewardInput) => Effect.sync(() => void rewards.push(input)),
  } satisfies DagRuntime
  return { runtime, rewards }
}
