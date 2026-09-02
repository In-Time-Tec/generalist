import { Function } from "effect"
import type { RunEvent } from "../run/event.js"
import type { TreeEvent } from "../tree.js"
import { make as makeTreeCursor } from "./cursor.js"

type RunLocation = {
  readonly rootRunId: string
  readonly parentRunId?: string
  readonly invocationId?: string
}

type MutableTreeEvent = { -readonly [Key in keyof TreeEvent]: TreeEvent[Key] }
interface CallIdentity {
  modelCallId?: string
  modelAttemptId?: string
  toolCallId?: string
}

const modelIdentity = (event: RunEvent): CallIdentity => {
  const identity: CallIdentity = {}
  switch (event._tag) {
    case "ModelResponseCommitted":
    case "ModelResponseInterrupted":
    case "ModelAttemptStarted":
    case "ModelAttemptFirstOutput":
    case "ModelAttemptCompleted":
    case "ModelAttemptFailed":
      identity.modelCallId = event.modelCallId
      identity.modelAttemptId = event.modelAttemptId
      break
    case "ModelCallStarted":
    case "ModelFallbackScheduled":
    case "ModelRetryScheduled":
    case "ModelCallCompleted":
    case "ModelCallFailed":
      identity.modelCallId = event.modelCallId
      break
  }
  return identity
}

const callIdentity = (event: RunEvent): Pick<TreeEvent, "modelCallId" | "modelAttemptId" | "toolCallId"> => {
  const identity = modelIdentity(event)
  switch (event._tag) {
    case "ToolProgress":
      identity.toolCallId = event.toolCallId
      break
    case "ToolExecutionStarted":
    case "ToolExecutionCompleted":
    case "ApprovalRequested":
      identity.toolCallId = event.call.id
      break
    case "ChildLinked":
      if (event.origin?.parentToolCallId !== undefined) identity.toolCallId = event.origin.parentToolCallId
      break
  }
  return identity
}

const project = (event: RunEvent, position: number, run: RunLocation): TreeEvent => {
  const projected: MutableTreeEvent = {
    rootRunId: run.rootRunId,
    runId: event.runId,
    event,
    cursor: makeTreeCursor(run.rootRunId, position),
  }
  if (run.parentRunId !== undefined) projected.parentRunId = run.parentRunId
  if (run.invocationId !== undefined) projected.invocationId = run.invocationId
  Object.assign(projected, callIdentity(event))
  return projected
}

interface ProjectTreeEvent {
  (event: RunEvent, position: number, run: RunLocation): TreeEvent
  (position: number, run: RunLocation): (event: RunEvent) => TreeEvent
}

export const projectTreeEvent: ProjectTreeEvent = Function.dual(3, project)
