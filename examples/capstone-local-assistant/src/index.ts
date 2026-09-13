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
import { Prompt, Tool, Toolkit } from "effect/unstable/ai"
import { Chat, Connection } from "generalist/unstable/foldkit"
import { WorkingMemory } from "generalist/memory"
import { layer as deterministicLayer } from "generalist/providers/deterministic"
import { FileSystemCatalog } from "generalist/instructions/skills"

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

const runChanged = (
  cursor: number,
  status: "pending" | "running" | "waiting" | "succeeded" | "failed" | "cancelled",
  turn: number,
): Connection.Incoming =>
  Connection.HostDelivery({
    epoch: 0,
    activeRunId: status === "succeeded" || status === "failed" || status === "cancelled" ? null : "capstone-run",
    event: {
      _tag: "RunChanged",
      sessionId: "capstone-session",
      cursor: String(cursor),
      run: {
        runId: "capstone-run",
        rootRunId: "capstone-run",
        agent: { name: "capstone-assistant", revision: "1" },
        status,
        cursor: String(cursor),
        turn,
      },
    },
  })

const chatFrames: ReadonlyArray<Connection.Incoming> = [
  Connection.ConnectionOpened({ sessionId: "capstone-session", epoch: 0 }),
  runChanged(0, "running", 0),
  Connection.HostDelivery({
    epoch: 0,
    activeRunId: "capstone-run",
    event: {
      _tag: "ConversationChanged",
      sessionId: "capstone-session",
      cursor: "1",
      update: {
        previousLeafId: null,
        leafId: "entry-response-0",
        afterEntryId: null,
        entries: [
          {
            id: "entry-response-0",
            parentId: null,
            messages: [
              Prompt.makeMessage("assistant", {
                content: [Prompt.makePart("text", { text: "deterministic response" })],
              }),
            ],
          },
        ],
      },
    },
  }),
  runChanged(2, "running", 0),
  runChanged(3, "succeeded", 1),
]

const [chatModel] = Chat.update(
  Chat.initialModel("capstone-session"),
  Chat.ReceivedConnection({
    event: Connection.SessionSnapshot({
      epoch: 0,
      snapshot: {
        version: 1,
        session: {
          id: "capstone-session",
          createdAt: "2026-09-02T00:00:00.000Z",
          lifecycle: "active",
          queue: [],
        },
        cursor: "-1",
        runs: [],
        conversation: { leafId: null, entries: [] },
      },
    }),
  }),
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
