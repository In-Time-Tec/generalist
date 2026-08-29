import {
  TaskState,
  type AgentCard,
  type CancelTaskRequest,
  type ListTasksRequest,
  type ListTasksResponse,
  type Message,
  type SendMessageRequest,
  type StreamResponse,
  type SubscribeToTaskRequest,
  type Task,
} from "@a2a-js/sdk"
import { ContentTypeNotSupportedError, TaskNotCancelableError } from "@a2a-js/sdk/errors"
import {
  AgentEvent,
  type AgentExecutor,
  DefaultRequestHandler,
  type ExecutionEventBus,
  type RequestContext,
  type ServerCallContext,
  type TaskStore,
} from "@a2a-js/sdk/server"
import type { Address } from "../../runtime/address.js"
import { origin, type Cursor } from "../../runtime/cursor.js"
import type { RunStatus } from "../../runtime/run.js"
import type { RunEvent } from "../../runtime/run/event.js"
import type { EventsError, Service as RuntimeService } from "../../runtime/service.js"
import { Errors } from "../../runtime/facade-errors.js"
import { Effect, Function, Option, Schema, Stream } from "effect"
import { decode } from "./content.js"
import { artifactFromEvent, fromRuntime, stateFromRun, statusFromEvent } from "./projection.js"
import { TaskNotWaiting } from "./errors.js"

/** @experimental One explicit A2A endpoint deployment. */
export interface Deployment {
  readonly address: Address
  readonly card: AgentCard
}

const runtimeStatusFrom = (state: TaskState): RunStatus | undefined => {
  switch (state) {
    case TaskState.TASK_STATE_SUBMITTED:
      return "queued"
    case TaskState.TASK_STATE_WORKING:
      return "running"
    case TaskState.TASK_STATE_INPUT_REQUIRED:
    case TaskState.TASK_STATE_AUTH_REQUIRED:
      return "waiting"
    case TaskState.TASK_STATE_COMPLETED:
      return "succeeded"
    case TaskState.TASK_STATE_FAILED:
    case TaskState.TASK_STATE_REJECTED:
      return "failed"
    case TaskState.TASK_STATE_CANCELED:
      return "cancelled"
    default:
      return undefined
  }
}

const withoutArtifacts = (task: Task): Task => ({
  id: task.id,
  contextId: task.contextId,
  status: task.status,
  artifacts: [],
  history: task.history,
  metadata: task.metadata,
})

const makeTaskStore = (runtime: RuntimeService): TaskStore => ({
  save: () => Promise.resolve(),
  load: (taskId: string, _context: ServerCallContext) =>
    Effect.runPromise(
      fromRuntime(runtime, taskId).pipe(
        Effect.map(Option.some),
        Effect.catchTag("tenetkit/a2a/TaskProjectionFailed", (failure) =>
          Schema.is(Errors.RunNotFound)(failure.cause) ? Effect.succeed(Option.none<Task>()) : Effect.fail(failure),
        ),
        Effect.map(Option.getOrUndefined),
      ),
    ),
  list: (params: ListTasksRequest, _context: ServerCallContext): Promise<ListTasksResponse> => {
    const pageSize = params.pageSize ?? 50
    const offset = params.pageToken === "" ? 0 : Number.parseInt(params.pageToken, 10)
    const status = runtimeStatusFrom(params.status)
    const effect = Effect.gen(function* () {
      const listOptions =
        status === undefined
          ? { limit: offset + pageSize + 1 }
          : {
              status,
              limit: offset + pageSize + 1,
            }
      const inspections = yield* runtime.list(listOptions)
      const selected = inspections.slice(offset, offset + pageSize)
      const tasks = yield* Effect.forEach(selected, (inspection) => fromRuntime(runtime, inspection.runId))
      const filtered = params.contextId === "" ? tasks : tasks.filter((task) => task.contextId === params.contextId)
      return {
        tasks: params.includeArtifacts === true ? filtered : filtered.map(withoutArtifacts),
        nextPageToken: inspections.length > offset + pageSize ? String(offset + pageSize) : "",
        pageSize,
        totalSize: inspections.length,
      }
    })
    return Effect.runPromise(effect)
  },
})

function rejectedPromise<E>(error: E): Promise<never> {
  return Promise.reject(error)
}

const toAsyncGenerator = <A>(iterable: AsyncIterable<A>): AsyncGenerator<A, void, undefined> => {
  const iterator = iterable[Symbol.asyncIterator]()
  return {
    [Symbol.asyncIterator]() {
      return this
    },
    next: () => iterator.next(),
    return: (value) =>
      iterator.return === undefined ? Promise.resolve({ done: true, value }) : iterator.return(value),
    throw: (error) => (iterator.throw === undefined ? rejectedPromise(error) : iterator.throw(error)),
    [Symbol.asyncDispose]: () =>
      iterator.return === undefined ? Promise.resolve() : iterator.return(undefined).then(() => undefined),
  }
}

const isBoundary = (event: RunEvent): boolean =>
  event._tag === "RunWaiting" ||
  event._tag === "RunCompleted" ||
  event._tag === "RunFailed" ||
  event._tag === "RunCancelled"

const publishEvent = (
  bus: ExecutionEventBus,
  task: Task,
  event: RunEvent,
  preceding: ReadonlyArray<RunEvent>,
): void => {
  if (event._tag === "RunCompleted") {
    bus.publish(
      AgentEvent.artifactUpdate({
        taskId: task.id,
        contextId: task.contextId,
        artifact: artifactFromEvent(event, preceding),
        append: false,
        lastChunk: true,
        metadata: {},
      }),
    )
  }
  const status = statusFromEvent(task, event)
  if (status !== undefined) {
    bus.publish(AgentEvent.statusUpdate({ taskId: task.id, contextId: task.contextId, status, metadata: {} }))
  }
}

const follow = (
  runtime: RuntimeService,
  task: Task,
  cursor: Cursor,
  bus: ExecutionEventBus,
): Effect.Effect<void, EventsError> => {
  const preceding: Array<RunEvent> = []
  return runtime.events({ runId: task.id, cursor }).pipe(
    Stream.tap((event) => Effect.sync(() => publishEvent(bus, task, event, preceding))),
    Stream.tap((event) => Effect.sync(() => preceding.push(event))),
    Stream.takeUntil(isBoundary),
    Stream.runDrain,
  )
}

const makeExecutor = (runtime: RuntimeService, deployment: Deployment): AgentExecutor => ({
  execute: (context: RequestContext, bus: ExecutionEventBus): Promise<void> => {
    const effect = Effect.gen(function* () {
      const prompt = yield* decode(context.userMessage)
      if (context.task === undefined) {
        const receipt = yield* runtime.send({
          runId: context.taskId,
          to: deployment.address,
          sessionId: context.contextId,
          idempotencyKey: context.userMessage.messageId,
          messageId: context.userMessage.messageId,
          correlationId: context.contextId,
          prompt,
        })
        const task = yield* fromRuntime(runtime, receipt.runId)
        bus.publish(AgentEvent.task(task))
        yield* follow(runtime, task, origin, bus)
        return
      }

      const snapshot = yield* runtime.snapshot(context.taskId)
      const task = yield* fromRuntime(runtime, context.taskId)
      bus.publish(AgentEvent.task(task))
      const wait = snapshot.run.wait
      if (snapshot.run.status !== "waiting" || wait === undefined || wait.status !== "open") {
        return yield* TaskNotWaiting.make({
          taskId: context.taskId,
          message: `Task ${context.taskId} is not waiting for input`,
        })
      }
      if (wait.reason._tag === "Approval") {
        yield* runtime.respondApproval({
          runId: context.taskId,
          approvalId: wait.reason.request.approvalId,
          decision: { _tag: "Approved" },
        })
      } else {
        yield* runtime.respond({
          runId: context.taskId,
          waitId: wait.waitId,
          resolution: { _tag: "ToolResult", result: prompt, encodedResult: prompt },
          idempotencyKey: context.userMessage.messageId,
        })
      }
      yield* follow(runtime, task, snapshot.cursor, bus)
    })
    return Effect.runPromise(effect)
  },
  cancelTask: (taskId: string, bus: ExecutionEventBus): Promise<void> =>
    Effect.runPromise(
      Effect.gen(function* () {
        yield* runtime.cancel({ runId: taskId, reason: "A2A cancel request" })
        const snapshot = yield* runtime.snapshot(taskId)
        const task = yield* fromRuntime(runtime, taskId)
        const history = yield* runtime.history({ runId: taskId, cursor: snapshot.cursor - 1, limit: 1 })
        const event = history[0]
        if (event !== undefined) publishEvent(bus, task, event, history)
        if (event === undefined && snapshot.run.status === "cancelled") {
          bus.publish(
            AgentEvent.statusUpdate({
              taskId,
              contextId: task.contextId,
              status: { state: stateFromRun(snapshot.run), message: undefined, timestamp: undefined },
              metadata: {},
            }),
          )
        }
      }),
    ),
})

const validateRequest = (request: SendMessageRequest): Promise<void> => {
  if (request.message === undefined) return Promise.resolve()
  return Effect.runPromise(
    decode(request.message).pipe(
      Effect.mapError((failure) => {
        const options =
          failure.part === undefined
            ? {
                message: failure.message,
                cause: failure,
              }
            : {
                message: failure.message,
                cause: failure,
                metadata: { part: String(failure.part) },
              }
        return new ContentTypeNotSupportedError(options)
      }),
      Effect.asVoid,
    ),
  )
}

class RuntimeRequestHandler extends DefaultRequestHandler {
  constructor(
    card: AgentCard,
    store: TaskStore,
    executor: AgentExecutor,
    private readonly runtime: RuntimeService,
  ) {
    super(card, store, executor)
  }

  override sendMessage(params: SendMessageRequest, context: ServerCallContext): Promise<Message | Task> {
    return validateRequest(params).then(() => super.sendMessage(params, context))
  }

  override sendMessageStream(
    params: SendMessageRequest,
    context: ServerCallContext,
  ): AsyncGenerator<StreamResponse, void, undefined> {
    const stream = () => super.sendMessageStream(params, context)
    return toAsyncGenerator(
      Stream.toAsyncIterable(
        Stream.fromEffect(Effect.promise(() => validateRequest(params))).pipe(
          Stream.flatMap(() =>
            Stream.fromAsyncIterable(stream(), (error): never => {
              throw error
            }),
          ),
        ),
      ),
    )
  }

  override cancelTask(params: CancelTaskRequest, _context: ServerCallContext): Promise<Task> {
    const runtime = this.runtime
    return Effect.runPromise(
      Effect.gen(function* () {
        yield* runtime.cancel({ runId: params.id, reason: "A2A cancel request" })
        const snapshot = yield* runtime.snapshot(params.id)
        if (snapshot.run.status !== "cancelled") {
          return yield* Effect.fail(new TaskNotCancelableError(`Task not cancelable: ${params.id}`))
        }
        return yield* fromRuntime(runtime, params.id)
      }),
    )
  }

  override resubscribe(
    params: SubscribeToTaskRequest,
    _context: ServerCallContext,
  ): AsyncGenerator<StreamResponse, void, undefined> {
    const runtime = this.runtime
    const resubscribeResponses = (
      task: Task,
      events: Stream.Stream<RunEvent, EventsError>,
    ): Stream.Stream<StreamResponse, EventsError> => {
      const preceding: Array<RunEvent> = []
      return events.pipe(
        Stream.takeUntil(isBoundary),
        Stream.map((event) => {
          const responses: Array<StreamResponse> = []
          if (event._tag === "RunCompleted") {
            responses.push({
              payload: {
                $case: "artifactUpdate",
                value: {
                  taskId: task.id,
                  contextId: task.contextId,
                  artifact: artifactFromEvent(event, preceding),
                  append: false,
                  lastChunk: true,
                  metadata: {},
                },
              },
            })
          }
          const status = statusFromEvent(task, event)
          if (status !== undefined) {
            responses.push({
              payload: {
                $case: "statusUpdate",
                value: { taskId: task.id, contextId: task.contextId, status, metadata: {} },
              },
            })
          }
          preceding.push(event)
          return responses
        }),
        Stream.flatMap((responses) => Stream.fromIterable(responses)),
      )
    }
    return toAsyncGenerator(
      Stream.toAsyncIterable(
        Stream.fromEffect(
          Effect.gen(function* () {
            const snapshot = yield* runtime.snapshot(params.id)
            const task = yield* fromRuntime(runtime, params.id)
            return { snapshot, task }
          }),
        ).pipe(
          Stream.flatMap(({ snapshot, task }) => {
            const head = Stream.make({ payload: { $case: "task", value: task } })
            if (
              snapshot.run.status === "succeeded" ||
              snapshot.run.status === "failed" ||
              snapshot.run.status === "cancelled"
            ) {
              return head
            }
            return head.pipe(
              Stream.concat(resubscribeResponses(task, runtime.events({ runId: params.id, cursor: snapshot.cursor }))),
            )
          }),
        ),
      ),
    )
  }
}

/** @experimental Construct the SDK handler while keeping Runtime as task authority. */
export const make: {
  (runtime: RuntimeService, deployment: Deployment): DefaultRequestHandler
  (deployment: Deployment): (runtime: RuntimeService) => DefaultRequestHandler
} = Function.dual(
  2,
  (runtime: RuntimeService, deployment: Deployment): DefaultRequestHandler =>
    new RuntimeRequestHandler(deployment.card, makeTaskStore(runtime), makeExecutor(runtime, deployment), runtime),
)
