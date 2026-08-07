import type { Artifact, Message, Part, Task, TaskStatus } from "@a2a-js/sdk"
import { Role, TaskState } from "@a2a-js/sdk"
import { ExecutionState, type Run, type RunEvent, type Runtime } from "@batonfx/runtime"
import { Effect, Function, Schema } from "effect"
import { TaskProjectionFailed } from "./errors.js"

const textPart = (text: string): Part => ({
  content: { $case: "text", value: text },
  mediaType: "text/plain",
  filename: "",
  metadata: {},
})

const dataPart = (value: unknown): Part => ({
  content: { $case: "data", value },
  mediaType: "application/json",
  filename: "",
  metadata: {},
})

const agentMessage = (taskId: string, contextId: string, messageId: string, text: string): Message => ({
  messageId,
  taskId,
  contextId,
  role: Role.ROLE_AGENT,
  parts: [textPart(text)],
  metadata: {},
  extensions: [],
  referenceTaskIds: [],
})

/** @experimental Map authoritative Runtime status to A2A task state. */
export const stateFromRun = (run: Run.RunInspection): TaskState => {
  switch (run.status) {
    case "queued":
      return TaskState.TASK_STATE_SUBMITTED
    case "running":
    case "cancelling":
      return TaskState.TASK_STATE_WORKING
    case "waiting":
      return run.wait?.reason._tag === "Approval"
        ? TaskState.TASK_STATE_AUTH_REQUIRED
        : TaskState.TASK_STATE_INPUT_REQUIRED
    case "needs-resolution":
      return TaskState.TASK_STATE_INPUT_REQUIRED
    case "succeeded":
      return TaskState.TASK_STATE_COMPLETED
    case "failed":
      return TaskState.TASK_STATE_FAILED
    case "cancelled":
      return TaskState.TASK_STATE_CANCELED
  }
}

const terminalEvent = (events: ReadonlyArray<RunEvent.RunEvent>): RunEvent.RunEvent | undefined =>
  events.findLast(
    (event) => event._tag === "RunCompleted" || event._tag === "RunFailed" || event._tag === "RunCancelled",
  )

const contextIdFrom = (runId: string, events: ReadonlyArray<RunEvent.RunEvent>): string =>
  events.find((event) => event._tag === "RunAccepted")?.correlationId ?? runId

const statusFrom = (
  run: Run.RunInspection,
  events: ReadonlyArray<RunEvent.RunEvent>,
  contextId: string,
): TaskStatus => {
  const terminal = terminalEvent(events)
  let text: string | undefined
  if (terminal?._tag === "RunFailed") text = terminal.error.message
  if (terminal?._tag === "RunCancelled") text = terminal.reason ?? "Task canceled."
  if (run.status === "waiting" && run.wait !== undefined) text = `Waiting for ${run.wait.reason._tag}.`
  return {
    state: stateFromRun(run),
    message:
      text === undefined ? undefined : agentMessage(run.runId, contextId, terminal?.eventId ?? run.wait!.waitId, text),
    timestamp: terminal?.occurredAt ?? run.wait?.openedAt,
  }
}

const artifactFrom = (event: RunEvent.RunCompleted, events: ReadonlyArray<RunEvent.RunEvent>): Artifact => {
  const structured = events.findLast((candidate) => candidate._tag === "StructuredOutput")
  const parts =
    structured?._tag === "StructuredOutput"
      ? [dataPart(structured.value)]
      : Schema.is(ExecutionState.ProgramExecutionResult)(event.result)
        ? [dataPart(event.result.value)]
        : [textPart(event.result.text)]
  return {
    artifactId: `${event.eventId}:result`,
    name: "result",
    description: "Baton run result",
    parts,
    metadata: {},
    extensions: [],
  }
}

/** @experimental Project one Runtime snapshot and its canonical history to an A2A Task. */
export const fromRuntime: {
  (runtime: Runtime.Interface, taskId: string): Effect.Effect<Task, TaskProjectionFailed>
  (taskId: string): (runtime: Runtime.Interface) => Effect.Effect<Task, TaskProjectionFailed>
} = Function.dual(
  2,
  (runtime: Runtime.Interface, taskId: string): Effect.Effect<Task, TaskProjectionFailed> =>
    Effect.gen(function* () {
      const snapshot = yield* runtime.snapshot(taskId)
      const events = yield* runtime.history({ runId: taskId, limit: snapshot.cursor + 1 })
      const contextId = contextIdFrom(taskId, events)
      const completed = events.findLast((event): event is RunEvent.RunCompleted => event._tag === "RunCompleted")
      return {
        id: taskId,
        contextId,
        status: statusFrom(snapshot.run, events, contextId),
        artifacts: completed === undefined ? [] : [artifactFrom(completed, events)],
        history: [],
        metadata: { batonCursor: snapshot.cursor },
      }
    }).pipe(
      Effect.mapError((cause) =>
        TaskProjectionFailed.make({
          taskId,
          message: "Runtime task projection failed",
          cause,
        }),
      ),
    ),
)

/** @experimental Build a status update for one canonical Runtime event. */
export const statusFromEvent: {
  (task: Task, event: RunEvent.RunEvent): TaskStatus | undefined
  (event: RunEvent.RunEvent): (task: Task) => TaskStatus | undefined
} = Function.dual(2, (task: Task, event: RunEvent.RunEvent): TaskStatus | undefined => {
  switch (event._tag) {
    case "RunAttemptStarted":
    case "RunResumed":
      return { state: TaskState.TASK_STATE_WORKING, message: undefined, timestamp: event.occurredAt }
    case "RunWaiting":
      return {
        state:
          event.wait.reason._tag === "Approval"
            ? TaskState.TASK_STATE_AUTH_REQUIRED
            : TaskState.TASK_STATE_INPUT_REQUIRED,
        message: agentMessage(task.id, task.contextId, event.eventId, `Waiting for ${event.wait.reason._tag}.`),
        timestamp: event.occurredAt,
      }
    case "RunCompleted":
      return { state: TaskState.TASK_STATE_COMPLETED, message: undefined, timestamp: event.occurredAt }
    case "RunFailed":
      return {
        state: TaskState.TASK_STATE_FAILED,
        message: agentMessage(task.id, task.contextId, event.eventId, event.error.message),
        timestamp: event.occurredAt,
      }
    case "RunCancelled":
      return {
        state: TaskState.TASK_STATE_CANCELED,
        message: agentMessage(task.id, task.contextId, event.eventId, event.reason ?? "Task canceled."),
        timestamp: event.occurredAt,
      }
    default:
      return undefined
  }
})

/** @experimental Build the completion artifact update for a Runtime completion. */
export const artifactFromEvent: {
  (event: RunEvent.RunCompleted, preceding: ReadonlyArray<RunEvent.RunEvent>): Artifact
  (preceding: ReadonlyArray<RunEvent.RunEvent>): (event: RunEvent.RunCompleted) => Artifact
} = Function.dual(
  2,
  (event: RunEvent.RunCompleted, preceding: ReadonlyArray<RunEvent.RunEvent>): Artifact =>
    artifactFrom(event, preceding),
)
