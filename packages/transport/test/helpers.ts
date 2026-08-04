import { Effect, Layer, Stream } from "effect"
import { AgentRef, Runtime } from "@batonfx/runtime"
import type { RunEvent } from "@batonfx/runtime"

export const agent = AgentRef.make({ id: "assistant", version: "1", digest: "sha256:assistant" })

export const event = (sequence: number, tag = "RunAttemptStarted"): RunEvent.RunEvent =>
  ({
    _tag: tag,
    specVersion: "1",
    eventId: `run-1:${sequence}`,
    runId: "run-1",
    sequence,
    agent,
    rootRunId: "run-1",
    occurredAt: "2026-08-03T00:00:00.000Z",
    attempt: 1,
  }) as RunEvent.RunEvent

export const runtimeLayer = (implementation: Partial<Runtime.Interface> = {}): Layer.Layer<Runtime.Runtime> =>
  Layer.succeed(
    Runtime.Runtime,
    Runtime.Runtime.of({
      send: () => Effect.die("unused send"),
      spawn: () => Effect.die("unused spawn"),
      events: ({ cursor }) =>
        Stream.fromIterable([event(0), event(1), event(2)].filter((item) => item.sequence > (cursor ?? -1))),
      snapshot: (runId) =>
        Effect.succeed({
          run: { runId, status: "running", agent, lastSequence: 2, durability: "durable" },
          cursor: 2,
          usage: [],
          compactions: [],
        }),
      history: ({ cursor }) =>
        Effect.succeed([event(0), event(1), event(2)].filter((item) => item.sequence > (cursor ?? -1))),
      treeHistory: () => Effect.die("unused treeHistory"),
      inspectTree: () => Effect.die("unused inspectTree"),
      list: () => Effect.succeed([]),
      respond: () => Effect.die("unused respond"),
      signal: () => Effect.die("unused signal"),
      steer: () => Effect.die("unused steer"),
      cancel: () => Effect.void,
      inspect: (runId) => Effect.succeed({ runId, status: "running", agent, lastSequence: 2, durability: "durable" }),
      fanOut: () => Effect.die("unused fanOut"),
      inspectFanOut: () => Effect.die("unused inspectFanOut"),
      awaitFanOut: () => Effect.die("unused awaitFanOut"),
      ...implementation,
    }),
  )
