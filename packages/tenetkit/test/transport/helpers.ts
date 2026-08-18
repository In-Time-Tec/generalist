import { Effect, Function, Layer, Stream } from "effect"
import { ExecutableManifest, Runtime, TreePolicy } from "tenetkit/runtime"
import type { RunEvent } from "tenetkit/runtime"

export const executable: ExecutableManifest.PinnedExecutable = ExecutableManifest.makeTest("assistant", "1")
export const agent = executable.ref

export const event: {
  (sequence: number, tag?: string): RunEvent.RunEvent
  (tag?: string): (sequence: number) => RunEvent.RunEvent
} = Function.dual(
  (args) => typeof args[0] === "number",
  (sequence: number, tag: string = "RunAttemptStarted"): RunEvent.RunEvent =>
    ({
      _tag: tag,
      specVersion: "1",
      eventId: `run-1:${sequence}`,
      runId: "run-1",
      sequence,
      executableRef: agent,
      rootRunId: "run-1",
      depth: 0,
      occurredAt: "2026-08-03T00:00:00.000Z",
      attempt: 1,
    }) as RunEvent.RunEvent,
)

export const runtimeLayer = (implementation: Partial<Runtime.Interface> = {}): Layer.Layer<Runtime.Runtime> =>
  Layer.succeed(
    Runtime.Runtime,
    Runtime.Runtime.of({
      start: () => Effect.die("unused start"),
      send: () => Effect.die("unused send"),
      spawn: () => Effect.die("unused spawn"),
      previews: () => Stream.empty,
      events: ({ cursor }) =>
        Stream.fromIterable([event(0), event(1), event(2)].filter((item) => item.sequence > (cursor ?? -1))),
      snapshot: (runId) =>
        Effect.succeed({
          run: {
            runId,
            status: "running",
            executableRef: agent,
            executableManifest: executable.manifest,
            depth: 0,
            treePolicy: TreePolicy.defaultTreePolicy,
            lastSequence: 2,
            durability: "durable",
          },
          cursor: 2,
          usage: [],
          compactions: [],
        }),
      history: ({ cursor }) =>
        Effect.succeed([event(0), event(1), event(2)].filter((item) => item.sequence > (cursor ?? -1))),
      sessionEntry: () => Effect.die("unused sessionEntry"),
      resolveModelResponse: () => Effect.die("unused resolveModelResponse"),
      treeHistory: () => Effect.die("unused treeHistory"),
      treeChanges: () => Stream.empty,
      inspectTree: () => Effect.die("unused inspectTree"),
      list: () => Effect.succeed([]),
      respond: () => Effect.die("unused respond"),
      respondApproval: () => Effect.die("unused respondApproval"),
      signal: () => Effect.die("unused signal"),
      steer: () => Effect.die("unused steer"),
      sendMessage: () => Effect.die("unused sendMessage"),
      messages: () => Effect.die("unused messages"),
      childSettlements: () => Effect.die("unused childSettlements"),
      childSettlementChanges: () => Stream.die("unused childSettlementChanges"),
      awaitChildSettlement: () => Effect.die("unused awaitChildSettlement"),
      directory: () => Effect.die("unused directory"),
      registerAgentName: () => Effect.die("unused registerAgentName"),
      resolveOperation: () => Effect.die("unused resolveOperation"),
      cancel: () => Effect.void,
      cancelSession: () => Effect.void,
      awaitSessionTerminal: () => Effect.void,
      inspect: (runId) =>
        Effect.succeed({
          runId,
          status: "running",
          executableRef: agent,
          executableManifest: executable.manifest,
          depth: 0,
          treePolicy: TreePolicy.defaultTreePolicy,
          lastSequence: 2,
          durability: "durable",
        }),
      fanOut: () => Effect.die("unused fanOut"),
      inspectFanOut: () => Effect.die("unused inspectFanOut"),
      awaitFanOut: () => Effect.die("unused awaitFanOut"),
      ...implementation,
    }),
  )
