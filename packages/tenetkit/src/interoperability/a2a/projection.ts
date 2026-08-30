import { Role, TaskState, type Artifact, type Message, type Part, type Task, type TaskStatus } from "@a2a-js/sdk"
import { ProgramExecutionResult } from "../../runtime/execution/state.js"
import type { RunInspection } from "../../runtime/run.js"
import type { RunCompleted, RunEvent } from "../../runtime/run/event.js"
import type { Service as RuntimeService } from "../../runtime/service.js"
import { Effect, Function, Schema } from "effect"
import { TaskProjectionFailed } from "./errors.js"

const textPart = (text: string): Part => ({
  content: { $case: "text", value: text },
  mediaType: "text/plain",
  filename: "",
  metadata: {},
})

const dataPart = (value: Schema.Json): Part => ({
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
export const stateFromRun = (run: RunInspection): TaskState => {
  switch (run.status) {
    case "queued":
      return TaskState.TASK_STATE_SUBMITTED
    case "running":
    case "cancelling":
      return TaskState.TASK_STATE_WORKING
    case "waiting":
      return run.waits[0]?.reason._tag === "Approval"
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

const terminalEvent = (events: ReadonlyArray<RunEvent>): RunEvent | undefined =>
  events.findLast(
    (event) => event._tag === "RunCompleted" || event._tag === "RunFailed" || event._tag === "RunCancelled",
  )

const contextIdFrom = (runId: string, events: ReadonlyArray<RunEvent>): string =>
  events.find((event) => event._tag === "RunAccepted")?.correlationId ?? runId

const statusFrom = (run: RunInspection, events: ReadonlyArray<RunEvent>, contextId: string): TaskStatus => {
  const terminal = terminalEvent(events)
  const wait = run.waits[0]
  let text: string | undefined
  if (terminal?._tag === "RunFailed") text = terminal.error.message
  if (terminal?._tag === "RunCancelled") text = terminal.reason ?? "Task canceled."
  if (run.status === "waiting" && wait !== undefined) text = `Waiting for ${wait.reason._tag}.`
  return {
    state: stateFromRun(run),
    message:
      text === undefined ? undefined : agentMessage(run.runId, contextId, terminal?.eventId ?? wait!.waitId, text),
    timestamp: terminal?.occurredAt ?? wait?.openedAt,
  }
}

const artifactFrom = (event: RunCompleted, events: ReadonlyArray<RunEvent>): Artifact => {
  const structured = events.findLast((candidate) => candidate._tag === "StructuredOutput")
  let parts: Array<Part>
  if (structured?._tag === "StructuredOutput") {
    parts = [dataPart(Schema.decodeUnknownSync(Schema.Json)(structured.value))]
  } else if (Schema.is(ProgramExecutionResult)(event.result)) {
    parts = [dataPart(Schema.decodeUnknownSync(Schema.Json)(event.result.value))]
  } else {
    parts = [textPart(event.result.text)]
  }
  return {
    artifactId: `${event.eventId}:result`,
    name: "result",
    description: "TenetKit run result",
    parts,
    metadata: {},
    extensions: [],
  }
}

/** @experimental Project one Runtime snapshot and its canonical history to an A2A Task. */
export const fromRuntime: {
  (runtime: RuntimeService, taskId: string): Effect.Effect<Task, TaskProjectionFailed>
  (taskId: string): (runtime: RuntimeService) => Effect.Effect<Task, TaskProjectionFailed>
} = Function.dual(
  2,
  (runtime: RuntimeService, taskId: string): Effect.Effect<Task, TaskProjectionFailed> =>
    Effect.gen(function* () {
      const snapshot = yield* runtime.snapshot(taskId)
      const events = yield* runtime.history({ runId: taskId, limit: snapshot.cursor + 1 })
      const contextId = contextIdFrom(taskId, events)
      const completed = events.findLast((event): event is RunCompleted => event._tag === "RunCompleted")
      return {
        id: taskId,
        contextId,
        status: statusFrom(snapshot.run, events, contextId),
        artifacts: completed === undefined ? [] : [artifactFrom(completed, events)],
        history: [],
        metadata: { tenetkitCursor: snapshot.cursor },
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
  (task: Task, event: RunEvent): TaskStatus | undefined
  (event: RunEvent): (task: Task) => TaskStatus | undefined
} = Function.dual(2, (task: Task, event: RunEvent): TaskStatus | undefined => {
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
  (event: RunCompleted, preceding: ReadonlyArray<RunEvent>): Artifact
  (preceding: ReadonlyArray<RunEvent>): (event: RunCompleted) => Artifact
} = Function.dual(
  2,
  (event: RunCompleted, preceding: ReadonlyArray<RunEvent>): Artifact => artifactFrom(event, preceding),
)
