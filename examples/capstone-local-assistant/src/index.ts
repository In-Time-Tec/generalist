import { Console, Effect, Layer, ManagedRuntime, Schema, Stream } from "effect"
import {
  Agent,
  Approvals,
  Compaction,
  Memory,
  ModelMiddleware,
  ModelRegistry,
  Permissions,
  SkillCatalog,
} from "generalist"
import { Tool, Toolkit } from "effect/unstable/ai"
import { Chat, Connection } from "generalist/unstable/foldkit"
import { WorkingMemory } from "generalist/memory"
import { layer as deterministicLayer } from "generalist/providers/deterministic"
import { FileSystemCatalog } from "generalist/instructions/skills"
import { HostEvent } from "generalist/host"
import { ExecutableManifest, RunEvent } from "generalist/runtime"

const researchSkill: SkillCatalog.Skill = {
  name: "research",
  description: "Gather local project facts before answering implementation questions.",
  allowedTools: ["read", "search"],
  instructions: Effect.succeed("Read relevant local files and summarize constraints."),
  tools: [],
}

const approvalTool = Tool.make("publish_release", {
  description: "Publish a release after human approval",
  parameters: Schema.Struct({ version: Schema.String }),
  success: Schema.String,
  needsApproval: true,
})

const toolkit = Toolkit.make(approvalTool)

const toolkitLayer = toolkit.toLayer({
  publish_release: ({ version }) => Effect.succeed(`published ${version}`),
})

const agent = Agent.make({
  name: "capstone-assistant",
  instructions: "Use selected skills, remember stable facts, and ask before publishing.",
  toolkit,
})

const key: Memory.Key = { agent: "capstone-assistant", subject: "local-user" }
const filesystemSkillLayer = FileSystemCatalog.layer({ cwd: ".", roots: ["fixtures/.agents/skills"] })
const compactionLayer = Compaction.layer({ contextWindow: 64_000, reserveTokens: 1_024, keepRecentTokens: 8_000 })

const chatAgent = ExecutableManifest.makeTest("capstone-assistant", "1").ref
const runEvent = <Fields extends object>(sequence: number, fields: Fields): RunEvent.RunEvent =>
  Schema.decodeUnknownSync(RunEvent.RunEvent)({
    specVersion: "1",
    eventId: `capstone-run:${sequence}`,
    runId: "capstone-run",
    sequence,
    executableRef: chatAgent,
    rootRunId: "capstone-run",
    depth: 0,
    occurredAt: "2026-08-03T00:00:00.000Z",
    ...fields,
  })

const hostEvent = (cursor: number, tag: HostEvent["_tag"], event: RunEvent.RunEvent): Connection.Incoming =>
  Schema.decodeUnknownSync(HostEvent)({
    _tag: tag,
    sessionId: "capstone-session",
    cursor,
    runId: "capstone-run",
    event,
  })

const chatFrames: ReadonlyArray<Connection.Incoming> = [
  hostEvent(0, "Turn", runEvent(0, { _tag: "TurnStarted", turn: 0 })),
  hostEvent(2, "Turn", runEvent(2, { _tag: "TurnCompleted", turn: 0 })),
  hostEvent(
    3,
    "Completed",
    runEvent(3, {
      _tag: "RunCompleted",
      result: {
        text: "deterministic response",
        turns: 1,
        session: { sessionId: "capstone-session", leafId: "entry-response-0" },
      },
    }),
  ),
]

const [chatModel] = Chat.update(
  Chat.initialModel("capstone-session"),
  Chat.ReceivedConnection({ event: Connection.ConnectionOpened() }),
)
const renderedChat = chatFrames.reduce(
  (model, frame) => Chat.update(model, Chat.ReceivedConnection({ event: frame }))[0],
  chatModel,
)

const program = Effect.gen(function* () {
  const source = yield* SkillCatalog.SkillCatalog
  const skills = yield* source.all
  const result = yield* ModelRegistry.withModel(
    { provider: "deterministic", model: "capstone" },
    Agent.run(agent, "Use the research skill before answering.", {
      memory: { key },
    }),
  )
  yield* Console.log(`skills=${skills.length} chatEntries=${renderedChat.entries.length} text=${result}`)
  yield* Effect.succeed(filesystemSkillLayer)
})

const runtimeLayer = Layer.mergeAll(
  deterministicLayer({ model: "capstone" }),
  toolkitLayer,
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
  SkillCatalog.layerSkills([researchSkill]),
  WorkingMemory.layer({ maxMessages: 4 }),
  Connection.layerTest({
    session: ({ sessionId }) => Effect.succeed({ sessionId, frames: Stream.empty, send: () => Effect.void }),
    send: () => Effect.void,
  }),
  compactionLayer,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
