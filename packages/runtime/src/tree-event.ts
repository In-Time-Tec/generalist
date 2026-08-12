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
  if (event._tag === "ChildLinked" && event.origin?.parentToolCallId !== undefined) {
    toolCallId = event.origin.parentToolCallId
  }
  return {
    ...(modelCallId === undefined ? {} : { modelCallId }),
    ...(modelAttemptId === undefined ? {} : { modelAttemptId }),
    ...(toolCallId === undefined ? {} : { toolCallId }),
  }
}

export const projectTreeEvent: {
  (
    event: RunEvent,
    position: number,
    run: { readonly rootRunId: string; readonly parentRunId?: string; readonly invocationId?: string },
  ): TreeEvent
  (
    position: number,
    run: { readonly rootRunId: string; readonly parentRunId?: string; readonly invocationId?: string },
  ): (event: RunEvent) => TreeEvent
} = (
  eventOrPosition: RunEvent | number,
  maybePosition?:
    | number
    | { readonly rootRunId: string; readonly parentRunId?: string; readonly invocationId?: string },
  maybeRun?: { readonly rootRunId: string; readonly parentRunId?: string; readonly invocationId?: string },
): any => {
  if (maybeRun === undefined) {
    return (event: RunEvent) =>
      projectTreeEvent(
        event,
        eventOrPosition as number,
        maybePosition as {
          readonly rootRunId: string
          readonly parentRunId?: string
          readonly invocationId?: string
        },
      )
  }
  const event = eventOrPosition as RunEvent
  const position = maybePosition as number
  const run = maybeRun
  return {
    rootRunId: run.rootRunId,
    runId: event.runId,
    ...(run.parentRunId === undefined ? {} : { parentRunId: run.parentRunId }),
    ...(run.invocationId === undefined ? {} : { invocationId: run.invocationId }),
    ...callIdentity(event),
    event,
    cursor: makeCursor(run.rootRunId, position),
  }
}
