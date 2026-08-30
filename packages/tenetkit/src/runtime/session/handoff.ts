import { Commit } from "../../core/policy/handoff.js"
import { Function, Option, Schema } from "effect"
import type { Prompt } from "effect/unstable/ai"
import { RuntimeUnavailable } from "../errors.js"
import { ExecutionCheckpoint } from "../execution/state.js"

export interface HandoffSessionEntry {
  readonly sessionId: string
  readonly entryId: string
  readonly parentId: string | null
  readonly handoffId: string
  readonly target: string
  readonly projectedHistory: Prompt.Prompt
}

const handoffEquivalence = Schema.toEquivalence(Commit)
const checkpointEquivalence = Schema.toEquivalence(ExecutionCheckpoint)
type HandoffCandidate = typeof Schema.Unknown.Type

export const isCommit = (value: HandoffCandidate): boolean => Option.isSome(Schema.decodeUnknownOption(Commit)(value))

export const decodeCommit = (value: HandoffCandidate): Commit | RuntimeUnavailable => {
  const decoded = Schema.decodeUnknownOption(Commit)(value)
  return Option.isNone(decoded)
    ? RuntimeUnavailable.make({ message: "succeeded handoff operation has an invalid projection commit" })
    : decoded.value
}

export const sameHandoffCheckpoint: {
  (right: ExecutionCheckpoint | undefined): (left: ExecutionCheckpoint | undefined) => boolean
  (left: ExecutionCheckpoint | undefined, right: ExecutionCheckpoint | undefined): boolean
} = Function.dual(2, (left: ExecutionCheckpoint | undefined, right: ExecutionCheckpoint | undefined): boolean =>
  left === undefined ? right === undefined : right !== undefined && checkpointEquivalence(left, right),
)

export const sameCommit: {
  (right: HandoffCandidate): (left: HandoffCandidate) => boolean
  (left: HandoffCandidate, right: HandoffCandidate): boolean
} = Function.dual(2, (left: HandoffCandidate, right: HandoffCandidate): boolean => {
  const leftCommit = Schema.decodeUnknownOption(Commit)(left)
  const rightCommit = Schema.decodeUnknownOption(Commit)(right)
  return (
    Option.isSome(leftCommit) && Option.isSome(rightCommit) && handoffEquivalence(leftCommit.value, rightCommit.value)
  )
})

export const handoffSessionEntry = (input: {
  readonly sessionId: string
  readonly operationKey: string
  readonly value: unknown
}): HandoffSessionEntry | RuntimeUnavailable => {
  const commit = decodeCommit(input.value)
  if (Schema.is(RuntimeUnavailable)(commit)) return commit
  const frame = commit.state.path.at(-1)
  if (frame === undefined || frame.handoffId !== input.operationKey || frame.target !== commit.state.active) {
    return RuntimeUnavailable.make({
      message: "succeeded handoff operation has an inconsistent terminal handoff frame",
    })
  }
  if (commit.sessionEntryId !== `${frame.handoffId}:session-projection`) {
    return RuntimeUnavailable.make({
      message: "succeeded handoff operation has an inconsistent Session entry identity",
    })
  }
  if (commit.projectedHistory.content.some((message) => message.role === "system")) {
    return RuntimeUnavailable.make({ message: "succeeded handoff projection contains a system message" })
  }
  return {
    sessionId: input.sessionId,
    entryId: commit.sessionEntryId,
    parentId: commit.sessionParentId,
    handoffId: frame.handoffId,
    target: commit.state.active,
    projectedHistory: commit.projectedHistory,
  }
}

export const handoffPayload = (input: HandoffSessionEntry) => ({
  _tag: "Handoff" as const,
  handoffId: input.handoffId,
  target: input.target,
  projectedHistory: input.projectedHistory,
})
