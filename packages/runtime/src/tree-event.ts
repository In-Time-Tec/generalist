import type { RunEvent } from "./run-event.js"
import type { TreeEvent } from "./tree.js"
import { makeCursor } from "./tree-cursor.js"

const callIdentity = (event: RunEvent) => {
  const modelCallId = "modelCallId" in event && typeof event.modelCallId === "string" ? event.modelCallId : undefined
  const modelAttemptId =
    "modelAttemptId" in event && typeof event.modelAttemptId === "string" ? event.modelAttemptId : undefined
  let toolCallId: string | undefined
  if (event._tag === "ToolProgress") toolCallId = event.toolCallId
  if (
    event._tag === "ToolExecutionStarted" ||
    event._tag === "ToolExecutionCompleted" ||
    event._tag === "ApprovalRequested"
  ) {
    toolCallId = event.call.id
  }
  if (event._tag === "ModelPart") {
    switch (event.part.type) {
      case "tool-call":
      case "tool-result":
      case "tool-params-start":
      case "tool-params-delta":
      case "tool-params-end":
        toolCallId = event.part.id
        break
      case "tool-approval-request":
        toolCallId = event.part.toolCallId
        break
    }
  }
  return {
    ...(modelCallId === undefined ? {} : { modelCallId }),
    ...(modelAttemptId === undefined ? {} : { modelAttemptId }),
    ...(toolCallId === undefined ? {} : { toolCallId }),
  }
}

export const projectTreeEvent = (
  event: RunEvent,
  position: number,
  run: { readonly rootRunId: string; readonly parentRunId?: string; readonly invocationId?: string },
): TreeEvent => ({
  rootRunId: run.rootRunId,
  runId: event.runId,
  ...(run.parentRunId === undefined ? {} : { parentRunId: run.parentRunId }),
  ...(run.invocationId === undefined ? {} : { invocationId: run.invocationId }),
  ...callIdentity(event),
  event,
  cursor: makeCursor(run.rootRunId, position),
})
