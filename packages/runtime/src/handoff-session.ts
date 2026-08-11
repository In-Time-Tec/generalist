import { Handoff } from "@batonfx/core"
import { Function, Option, Schema } from "effect"
import type { Prompt } from "effect/unstable/ai"
import { RuntimeUnavailable } from "./errors.js"
import { ExecutionCheckpoint } from "./execution-state.js"

export interface HandoffSessionEntry {
  readonly sessionId: string
  readonly entryId: string
  readonly parentId: string | null
  readonly handoffId: string
  readonly target: string
  readonly projectedHistory: Prompt.Prompt
}

const handoffEquivalence = Schema.toEquivalence(Handoff.HandoffCommit)
const checkpointEquivalence = Schema.toEquivalence(ExecutionCheckpoint)

export const isHandoffCommit = (value: unknown): boolean =>
  Option.isSome(Schema.decodeUnknownOption(Handoff.HandoffCommit)(value))

export const decodeHandoffCommit = (value: unknown): Handoff.HandoffCommit | RuntimeUnavailable => {
  const decoded = Schema.decodeUnknownOption(Handoff.HandoffCommit)(value)
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

export const sameHandoffCommit: {
  (right: unknown): (left: unknown) => boolean
  (left: unknown, right: unknown): boolean
} = Function.dual(2, (left: unknown, right: unknown): boolean => {
  const leftCommit = Schema.decodeUnknownOption(Handoff.HandoffCommit)(left)
  const rightCommit = Schema.decodeUnknownOption(Handoff.HandoffCommit)(right)
  return (
    Option.isSome(leftCommit) && Option.isSome(rightCommit) && handoffEquivalence(leftCommit.value, rightCommit.value)
  )
})

export const handoffSessionEntry = (input: {
  readonly sessionId: string
  readonly operationKey: string
  readonly value: unknown
}): HandoffSessionEntry | RuntimeUnavailable => {
  const commit = decodeHandoffCommit(input.value)
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
