import type { AgentCard, Message, SendMessageRequest } from "@a2a-js/sdk"
import { Role, TaskState } from "@a2a-js/sdk"
import { ServerCallContext } from "@a2a-js/sdk/server"
import { Address, AgentRef, type Run, type RunEvent, type Runtime } from "@batonfx/runtime"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Stream } from "effect"
import { Prompt } from "effect/unstable/ai"
import { makeHandler } from "../src/adapter.js"

const address = Address.make("agent:test")
const agent = AgentRef.make({ id: "test", version: "1", digest: "sha256:test" })

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
  agent,
  rootRunId: runId,
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
  result: { text: "complete", turns: 1, transcript: Prompt.empty },
})

const waiting = (runId: string): RunEvent.RunWaiting => ({
  ...base(runId, 2),
  _tag: "RunWaiting",
  wait: {
    waitId: `wait:${runId}`,
    reason: "tool-wait",
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

  const inspection = (runId: string, run: StoredRun): Run.RunInspection => ({
    runId,
    status: run.status,
    agent,
    ...(run.wait === undefined ? {} : { wait: run.wait }),
    lastSequence: run.events.at(-1)?.sequence ?? -1,
    durability: "ephemeral",
  })

  const runtime: Runtime.Interface = {
    send: (input) => {
      sentRunIds.push(input.runId!)
      const runId = input.runId!
      const shouldWait = input.messageId === "wait"
      runs.set(runId, {
        status: "queued",
        events: [accepted(runId)],
        pending: shouldWait ? [attempt(runId), waiting(runId)] : [attempt(runId), completed(runId, 2)],
      })
      return Effect.succeed({ runId, messageId: input.messageId!, acceptedSequence, duplicate: false })
    },
    spawn: () => Effect.die("not used"),
    fanOut: () => Effect.die("not used"),
    inspectFanOut: () => Effect.die("not used"),
    awaitFanOut: () => Effect.die("not used"),
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
      return Effect.succeed({ run: inspection(runId, run), cursor: run.events.at(-1)?.sequence ?? -1 })
    },
    history: ({ runId, cursor = -1, limit }) => {
      const run = runs.get(runId)!
      return Effect.succeed(run.events.filter((event) => event.sequence > cursor).slice(0, limit))
    },
    list: ({ status, limit }) =>
      Effect.succeed(
        [...runs]
          .filter(([, run]) => status === undefined || run.status === status)
          .slice(0, limit)
          .map(([runId, run]) => inspection(runId, run)),
      ),
    respond: ({ runId, waitId, resolution }) => {
      const run = runs.get(runId)!
      const next = run.events.at(-1)!.sequence + 1
      run.pending = [{ ...base(runId, next), _tag: "RunResumed", waitId, resolution }, completed(runId, next + 1)]
      return Effect.void
    },
    signal: () => Effect.void,
    steer: () => Effect.void,
    cancel: ({ runId, reason }) => {
      const run = runs.get(runId)!
      const next = run.events.at(-1)!.sequence + 1
      run.events.push({
        ...base(runId, next),
        _tag: "RunCancellationRequested",
        ...(reason === undefined ? {} : { reason }),
      })
      run.events.push({
        ...base(runId, next + 1),
        _tag: "RunCancelled",
        ...(reason === undefined ? {} : { reason }),
      })
      run.status = "cancelled"
      run.pending = []
      return Effect.void
    },
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

describe("DefaultRequestHandler projection", () => {
  it("streams a full Task first and keeps Task.id equal to Runtime runId", async () => {
    const fixture = makeRuntime()
    const handler = makeHandler(fixture.runtime, { address, card })
    const stream = handler.sendMessageStream(request(message("complete")), new ServerCallContext())
    const responses = []
    for await (const response of stream) responses.push(response)

    expect(responses[0]?.payload?.$case).toBe("task")
    const taskId = responses[0]?.payload?.$case === "task" ? responses[0].payload.value.id : ""
    expect(fixture.sentRunIds).toEqual([taskId])
    expect(responses.map((item) => item.payload?.$case)).toEqual([
      "task",
      "statusUpdate",
      "artifactUpdate",
      "statusUpdate",
    ])

    const task = await handler.getTask({ tenant: "", id: taskId }, new ServerCallContext())
    expect(task.status?.state).toBe(TaskState.TASK_STATE_COMPLETED)
    expect(task.artifacts[0]?.parts[0]?.content).toEqual({ $case: "text", value: "complete" })

    const listed = await handler.listTasks(
      {
        tenant: "",
        contextId: "",
        status: TaskState.TASK_STATE_UNSPECIFIED,
        pageToken: "",
        statusTimestampAfter: undefined,
      },
      new ServerCallContext(),
    )
    expect(listed.tasks.map((item) => item.id)).toEqual([taskId])
  })

  it("starts a newly admitted run at the run-event origin, not its lane sequence", async () => {
    const fixture = makeRuntime(7)
    const handler = makeHandler(fixture.runtime, { address, card })
    const responses = []
    for await (const response of handler.sendMessageStream(request(message("later-lane")), new ServerCallContext())) {
      responses.push(response)
    }

    expect(fixture.observedCursors).toEqual([-1])
    expect(responses.map((item) => item.payload?.$case)).toEqual([
      "task",
      "statusUpdate",
      "artifactUpdate",
      "statusUpdate",
    ])
  })

  it("resubscribes, responds to the authoritative wait, and cancels through Runtime", async () => {
    const fixture = makeRuntime()
    const handler = makeHandler(fixture.runtime, { address, card })
    const initial = []
    for await (const response of handler.sendMessageStream(request(message("wait")), new ServerCallContext())) {
      initial.push(response)
    }
    const taskId = initial[0]?.payload?.$case === "task" ? initial[0].payload.value.id : ""
    expect(initial.at(-1)?.payload?.$case).toBe("statusUpdate")

    const subscription = handler.resubscribe({ tenant: "", id: taskId }, new ServerCallContext())
    const snapshot = await subscription.next()
    expect(snapshot.value?.payload?.$case).toBe("task")
    await subscription.return()

    const resumed = []
    for await (const response of handler.sendMessageStream(
      request(message("follow-up", taskId)),
      new ServerCallContext(),
    )) {
      resumed.push(response)
    }
    expect(resumed[0]?.payload?.$case).toBe("task")
    expect((await handler.getTask({ tenant: "", id: taskId }, new ServerCallContext())).status?.state).toBe(
      TaskState.TASK_STATE_COMPLETED,
    )

    const second = makeRuntime()
    const cancelHandler = makeHandler(second.runtime, { address, card })
    const waitingResponses = []
    for await (const response of cancelHandler.sendMessageStream(request(message("wait")), new ServerCallContext())) {
      waitingResponses.push(response)
    }
    const cancelId = waitingResponses[0]?.payload?.$case === "task" ? waitingResponses[0].payload.value.id : ""
    const canceled = await cancelHandler.cancelTask({ tenant: "", id: cancelId, metadata: {} }, new ServerCallContext())
    expect(canceled.status?.state).toBe(TaskState.TASK_STATE_CANCELED)
  })

  it("rejects agent-role and unsupported content before Runtime admission", async () => {
    const fixture = makeRuntime()
    const handler = makeHandler(fixture.runtime, { address, card })
    const injected = { ...message("bad"), role: Role.ROLE_AGENT }
    await expect(async () => {
      for await (const _response of handler.sendMessageStream(request(injected), new ServerCallContext())) {
        // The request must fail before an SDK Task or Runtime Run exists.
      }
    }).rejects.toMatchObject({ reason: "CONTENT_TYPE_NOT_SUPPORTED" })
    expect(fixture.sentRunIds).toEqual([])
  })
})
