import {
  type AgentCard,
  type Message,
  Role,
  type SendMessageRequest,
  type StreamResponse,
  TaskState,
} from "@a2a-js/sdk"
import { ServerCallContext } from "@a2a-js/sdk/server"
import {
  Address,
  ExecutableManifest,
  TreePolicy,
  type Run,
  type RunEvent,
  type Runtime,
} from "../../../src/runtime/index.js"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Option, Schema, Stream } from "effect"
import { make as makeHandler } from "../../../src/interoperability/a2a/handler.js"

const address = Address.make("agent:test")
const executable = ExecutableManifest.makeTest("test", "1")
const agent = executable.ref

const card: AgentCard = {
  name: "Test",
  description: "Test agent",
  supportedInterfaces: [
    { url: "https://example.test/a2a", protocolBinding: "JSONRPC", protocolVersion: "1.0", tenant: "" },
  ],
  provider: undefined,
  version: "1",
  capabilities: { streaming: true, extensions: [] },
  securitySchemes: {},
  securityRequirements: [],
  defaultInputModes: ["text/plain", "application/json"],
  defaultOutputModes: ["text/plain", "application/json"],
  skills: [],
  signatures: [],
}

const base = (runId: string, sequence: number) => ({
  specVersion: "1" as const,
  eventId: `${runId}:${sequence}`,
  runId,
  sequence,
  executableRef: agent,
  rootRunId: runId,
  depth: 0,
  correlationId: `context:${runId}`,
  occurredAt: `2026-08-03T00:00:0${sequence}.000Z`,
})

const accepted = (runId: string): RunEvent.RunAccepted => ({
  ...base(runId, 0),
  _tag: "RunAccepted",
  messageId: `message:${runId}`,
  address,
})

const attempt = (runId: string): RunEvent.RunAttemptStarted => ({
  ...base(runId, 1),
  _tag: "RunAttemptStarted",
  attempt: 1,
})

const completed = (runId: string, sequence: number): RunEvent.RunCompleted => ({
  ...base(runId, sequence),
  _tag: "RunCompleted",
  result: { text: "complete", turns: 1, session: { sessionId: `session:${runId}`, leafId: null } },
})

const completedProgram = (runId: string, sequence: number): RunEvent.RunCompleted => ({
  ...base(runId, sequence),
  _tag: "RunCompleted",
  result: { _tag: "Program", value: { answer: 42 } },
})

const waiting = (runId: string): RunEvent.RunWaiting => ({
  ...base(runId, 2),
  _tag: "RunWaiting",
  wait: {
    waitId: `wait:${runId}`,
    reason: { _tag: "ToolWait" },
    status: "open",
    openedAt: base(runId, 2).occurredAt,
  },
})

interface StoredRun {
  status: Run.RunStatus
  events: Array<RunEvent.RunEvent>
  pending: Array<RunEvent.RunEvent>
  wait?: Run.RunInspection["wait"]
}

const makeRuntime = (acceptedSequence = 0) => {
  const runs = new Map<string, StoredRun>()
  const sentRunIds: Array<string> = []
  const observedCursors: Array<number> = []

  const inspection = (runId: string, run: StoredRun): Run.RunInspection => {
    const common = {
      runId,
      status: run.status,
      executableRef: agent,
      executableManifest: executable.manifest,
      depth: 0,
      treePolicy: TreePolicy.defaultTreePolicy,
      lastSequence: run.events.at(-1)?.sequence ?? -1,
      durability: "ephemeral" as const,
    }
    return run.wait === undefined ? common : { ...common, wait: run.wait }
  }

  const runtime: Runtime.Service = {
    start: () => Effect.die("not used"),
    admit: () => Effect.die("not used"),
    activate: () => Effect.die("not used"),
    send: (input) => {
      sentRunIds.push(input.runId!)
      const runId = input.runId!
      const shouldWait = input.messageId === "wait"
      const shouldRunProgram = input.messageId === "program"
      runs.set(runId, {
        status: "queued",
        events: [accepted(runId)],
        pending: shouldWait
          ? [attempt(runId), waiting(runId)]
          : [attempt(runId), shouldRunProgram ? completedProgram(runId, 2) : completed(runId, 2)],
      })
      return Effect.succeed({ runId, messageId: input.messageId!, acceptedSequence, duplicate: false })
    },
    spawn: () => Effect.die("not used"),
    fanOut: () => Effect.die("not used"),
    inspectFanOut: () => Effect.die("not used"),
    awaitFanOut: () => Effect.die("not used"),
    previews: () => Stream.empty,
    events: ({ runId, cursor = -1 }) => {
      observedCursors.push(cursor)
      const run = runs.get(runId)!
      return Stream.fromIterable(run.pending.filter((event) => event.sequence > cursor)).pipe(
        Stream.tap((event) =>
          Effect.sync(() => {
            run.events.push(event)
            if (event._tag === "RunAttemptStarted") run.status = "running"
            if (event._tag === "RunWaiting") {
              run.status = "waiting"
              run.wait = event.wait
            }
            if (event._tag === "RunResumed") {
              run.status = "running"
              run.wait = { ...run.wait!, status: "responded", closedAt: event.occurredAt }
            }
            if (event._tag === "RunCompleted") run.status = "succeeded"
            if (event._tag === "RunCancelled") run.status = "cancelled"
          }),
        ),
      )
    },
    snapshot: (runId) => {
      const run = runs.get(runId)!
      return Effect.succeed({
        run: inspection(runId, run),
        cursor: run.events.at(-1)?.sequence ?? -1,
        usage: [],
        compactions: [],
      })
    },
    sessionEntry: () => Effect.die("not used"),
    resolveModelResponse: () => Effect.die("not used"),
    history: ({ runId, cursor = -1, limit }) => {
      const run = runs.get(runId)!
      return Effect.succeed(run.events.filter((event) => event.sequence > cursor).slice(0, limit))
    },
    treeReplay: () => Effect.die("not used"),
    treeChanges: () => Stream.empty,
    treeCheckpoint: () => Effect.die("not used"),
    list: ({ status, limit }) =>
      Effect.succeed(
        [...runs]
          .filter(([, run]) => status === undefined || run.status === status)
          .slice(0, limit)
          .map(([runId, run]) => inspection(runId, run)),
      ),
    respondApproval: () => Effect.die("not used"),
    respond: ({ runId, waitId, resolution }) => {
      const run = runs.get(runId)!
      const next = run.events.at(-1)!.sequence + 1
      run.pending = [{ ...base(runId, next), _tag: "RunResumed", waitId, resolution }, completed(runId, next + 1)]
      return Effect.void
    },
    signal: () => Effect.void,
    steer: () => Effect.succeed({ entryId: "steering:test", sequence: 0 }),
    sendMessage: () => Effect.die("not used"),
    messages: () => Effect.die("not used"),
    childSettlements: () => Effect.die("not used"),
    childSettlementChanges: () => Stream.die("not used"),
    awaitChildSettlement: () => Effect.die("not used"),
    directory: () => Effect.die("not used"),
    registerAgentName: () => Effect.die("not used"),
    resolveOperation: () => Effect.die("not used"),
    cancel: ({ runId, reason }) => {
      const run = runs.get(runId)!
      const next = run.events.at(-1)!.sequence + 1
      const requestedBase = {
        ...base(runId, next),
        _tag: "RunCancellationRequested" as const,
      }
      const cancelledBase = {
        ...base(runId, next + 1),
        _tag: "RunCancelled" as const,
      }
      const requested: RunEvent.RunCancellationRequested =
        reason === undefined ? requestedBase : { ...requestedBase, reason }
      const cancelled: RunEvent.RunCancelled = reason === undefined ? cancelledBase : { ...cancelledBase, reason }
      run.events.push(requested)
      run.events.push(cancelled)
      run.status = "cancelled"
      run.pending = []
      return Effect.void
    },
    cancelSession: () => Effect.die("not used"),
    awaitSessionTerminal: () => Effect.die("not used"),
    inspect: (runId) => Effect.succeed(inspection(runId, runs.get(runId)!)),
  }
  return { runtime, runs, sentRunIds, observedCursors }
}

const message = (messageId: string, taskId = ""): Message => ({
  messageId,
  contextId: taskId === "" ? "" : `context:${taskId}`,
  taskId,
  role: Role.ROLE_USER,
  parts: [{ content: { $case: "text", value: "hello" }, mediaType: "text/plain", filename: "", metadata: {} }],
  metadata: {},
  extensions: [],
  referenceTaskIds: [],
})

const request = (value: Message): SendMessageRequest => ({
  tenant: "",
  message: value,
  configuration: undefined,
  metadata: {},
})

type HandlerStream = AsyncGenerator<StreamResponse, void, undefined>

const collectResponses = (
  stream: HandlerStream,
): Effect.Effect<ReadonlyArray<StreamResponse>, { readonly reason: string }> =>
  Stream.fromAsyncIterable(stream, (error) => ({
    reason: Schema.decodeUnknownOption(Schema.Struct({ reason: Schema.String }))(error).pipe(
      Option.match({ onNone: () => String(error), onSome: ({ reason }) => reason }),
    ),
  })).pipe(Stream.runCollect)

describe("DefaultRequestHandler projection", () => {
  it.effect("streams a full Task first and keeps Task.id equal to Runtime runId", () =>
    Effect.gen(function* () {
      const fixture = makeRuntime()
      const handler = makeHandler(fixture.runtime, { address, card })
      const responses = yield* collectResponses(
        handler.sendMessageStream(request(message("complete")), new ServerCallContext()),
      )

      expect(responses[0]?.payload?.$case).toBe("task")
      const taskId = responses[0]?.payload?.$case === "task" ? responses[0].payload.value.id : ""
      expect(fixture.sentRunIds).toEqual([taskId])
      expect(responses.map((item) => item.payload?.$case)).toEqual([
        "task",
        "statusUpdate",
        "artifactUpdate",
        "statusUpdate",
      ])

      const task = yield* Effect.promise(() => handler.getTask({ tenant: "", id: taskId }, new ServerCallContext()))
      expect(task.status?.state).toBe(TaskState.TASK_STATE_COMPLETED)
      expect(task.artifacts[0]?.parts[0]?.content).toEqual({ $case: "text", value: "complete" })

      const listed = yield* Effect.promise(() =>
        handler.listTasks(
          {
            tenant: "",
            contextId: "",
            status: TaskState.TASK_STATE_UNSPECIFIED,
            pageToken: "",
            statusTimestampAfter: undefined,
          },
          new ServerCallContext(),
        ),
      )
      expect(listed.tasks.map((item) => item.id)).toEqual([taskId])
    }),
  )

  it.effect("projects Program completion values as structured artifacts", () =>
    Effect.gen(function* () {
      const fixture = makeRuntime()
      const handler = makeHandler(fixture.runtime, { address, card })
      const responses = yield* collectResponses(
        handler.sendMessageStream(request(message("program")), new ServerCallContext()),
      )

      const taskId = responses[0]?.payload?.$case === "task" ? responses[0].payload.value.id : ""
      const task = yield* Effect.promise(() => handler.getTask({ tenant: "", id: taskId }, new ServerCallContext()))
      expect(task.artifacts[0]?.parts[0]?.content).toEqual({ $case: "data", value: { answer: 42 } })
    }),
  )

  it.effect("starts a newly admitted run at the run-event origin, not its lane sequence", () =>
    Effect.gen(function* () {
      const fixture = makeRuntime(7)
      const handler = makeHandler(fixture.runtime, { address, card })
      const responses = yield* collectResponses(
        handler.sendMessageStream(request(message("later-lane")), new ServerCallContext()),
      )

      expect(fixture.observedCursors).toEqual([-1])
      expect(responses.map((item) => item.payload?.$case)).toEqual([
        "task",
        "statusUpdate",
        "artifactUpdate",
        "statusUpdate",
      ])
    }),
  )

  it.effect("resubscribes, responds to the authoritative wait, and cancels through Runtime", () =>
    Effect.gen(function* () {
      const fixture = makeRuntime()
      const handler = makeHandler(fixture.runtime, { address, card })
      const initial = yield* collectResponses(
        handler.sendMessageStream(request(message("wait")), new ServerCallContext()),
      )
      const taskId = initial[0]?.payload?.$case === "task" ? initial[0].payload.value.id : ""
      expect(initial.at(-1)?.payload?.$case).toBe("statusUpdate")

      const subscription = handler.resubscribe({ tenant: "", id: taskId }, new ServerCallContext())
      const snapshot = yield* Effect.promise(() => subscription.next())
      expect(snapshot.value?.payload?.$case).toBe("task")
      yield* Effect.promise(() => subscription.return())

      const resumed = yield* collectResponses(
        handler.sendMessageStream(request(message("follow-up", taskId)), new ServerCallContext()),
      )
      expect(resumed[0]?.payload?.$case).toBe("task")
      const resumedTask = yield* Effect.promise(() =>
        handler.getTask({ tenant: "", id: taskId }, new ServerCallContext()),
      )
      expect(resumedTask.status?.state).toBe(TaskState.TASK_STATE_COMPLETED)

      const second = makeRuntime()
      const cancelHandler = makeHandler(second.runtime, { address, card })
      const waitingResponses = yield* collectResponses(
        cancelHandler.sendMessageStream(request(message("wait")), new ServerCallContext()),
      )
      const cancelId = waitingResponses[0]?.payload?.$case === "task" ? waitingResponses[0].payload.value.id : ""
      const canceled = yield* Effect.promise(() =>
        cancelHandler.cancelTask({ tenant: "", id: cancelId, metadata: {} }, new ServerCallContext()),
      )
      expect(canceled.status?.state).toBe(TaskState.TASK_STATE_CANCELED)
    }),
  )

  it.effect("rejects agent-role and unsupported content before Runtime admission", () =>
    Effect.gen(function* () {
      const fixture = makeRuntime()
      const handler = makeHandler(fixture.runtime, { address, card })
      const injected = { ...message("bad"), role: Role.ROLE_AGENT }
      const outcome = yield* collectResponses(
        handler.sendMessageStream(request(injected), new ServerCallContext()),
      ).pipe(Effect.flip, Effect.option)
      expect(Option.isSome(outcome)).toBe(true)
      if (Option.isSome(outcome)) {
        expect(outcome.value.reason).toBe("CONTENT_TYPE_NOT_SUPPORTED")
      }
      expect(fixture.sentRunIds).toEqual([])
    }),
  )
})
