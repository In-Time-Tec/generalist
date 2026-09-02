import { Effect, Function, Layer, Schema, Stream } from "effect"
import { ExecutableManifest, RunEvent, Runtime, TreePolicy } from "generalist/runtime"

export const executable: ExecutableManifest.PinnedExecutable = ExecutableManifest.makeTest("assistant", "1")
export const agent = executable.ref

export const event: {
  (sequence: number, tag?: string): RunEvent.RunEvent
  (tag?: string): (sequence: number) => RunEvent.RunEvent
} = Function.dual(
  (args) => Schema.is(Schema.Finite)(args[0]),
  (sequence: number, tag: string = "RunAttemptStarted"): RunEvent.RunEvent =>
    Schema.decodeUnknownSync(RunEvent.RunEvent)({
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
    }),
)

export const runtimeLayer = (implementation: Partial<Runtime.Service> = {}): Layer.Layer<Runtime.Runtime> =>
  Layer.succeed(
    Runtime.Runtime,
    Runtime.Runtime.of({
      register: () => Effect.die("unused register"),
      start: () => Effect.die("unused start"),
      startExecution: () => Effect.die("unused startExecution"),
      admit: () => Effect.die("unused admit"),
      activate: () => Effect.die("unused activate"),
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
            waits: [],
          },
          cursor: 2,
          turn: 0,
          usage: [],
          budget: {},
          compactions: [],
        }),
      history: ({ cursor }) =>
        Effect.succeed([event(0), event(1), event(2)].filter((item) => item.sequence > (cursor ?? -1))),
      createSession: () => Effect.die("unused createSession"),
      session: () => Effect.die("unused session"),
      listSessions: Effect.die("unused listSessions"),
      sessionRuns: () => Effect.die("unused sessionRuns"),
      sessionEvents: () => Stream.die("unused sessionEvents"),
      acknowledge: () => Effect.die("unused acknowledge"),
      acknowledged: () => Effect.die("unused acknowledged"),
      sessionEntry: () => Effect.die("unused sessionEntry"),
      resolveModelResponse: () => Effect.die("unused resolveModelResponse"),
      treeReplay: () => Effect.die("unused treeReplay"),
      treeChanges: () => Stream.empty,
      treeCheckpoint: () => Effect.die("unused treeCheckpoint"),
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
          waits: [],
          turn: 0,
          usage: [],
          budget: {},
        }),
      extendBudget: () => Effect.die("unused extendBudget"),
      fanOut: () => Effect.die("unused fanOut"),
      inspectFanOut: () => Effect.die("unused inspectFanOut"),
      awaitFanOut: () => Effect.die("unused awaitFanOut"),
      ...implementation,
    }),
  )
