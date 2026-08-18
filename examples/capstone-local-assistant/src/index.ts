import { Console, Effect, Layer, ManagedRuntime, Schema, Stream } from "effect"
import {
  Agent,
  Approvals,
  Compaction,
  Memory,
  ModelMiddleware,
  ModelRegistry,
  Response,
  SkillSource,
  Tool,
  Toolkit,
} from "tenetkit"
import { Chat, Connection } from "tenetkit/foldkit"
import { WorkingMemory } from "tenetkit/memory"
import { Deterministic } from "tenetkit/ai"
import { SkillLoader } from "tenetkit/skills"
import { ExecutableManifest } from "tenetkit/runtime"

const researchFrontmatter: SkillSource.Frontmatter = {
  name: "research",
  description: "Gather local project facts before answering implementation questions.",
  allowedTools: ["read", "search"],
}

const researchSkill: SkillSource.Skill = {
  frontmatter: researchFrontmatter,
  listing: SkillSource.makeListing(researchFrontmatter),
  body: Effect.succeed("Read relevant local files and summarize constraints."),
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
const filesystemSkillLayer = SkillLoader.layer({ cwd: ".", roots: ["fixtures/.agents/skills"] })
const compactionLayer = Compaction.layer({ contextWindow: 64_000, reserveTokens: 1_024, keepRecentTokens: 8_000 })

const chatAgent = ExecutableManifest.makeTest("capstone-assistant", "1").ref
const runEvent = (sequence: number, fields: Record<string, unknown>): Connection.Incoming =>
  ({
    specVersion: "1",
    eventId: `capstone-run:${sequence}`,
    runId: "capstone-run",
    sequence,
    executableRef: chatAgent,
    rootRunId: "capstone-run",
    occurredAt: "2026-08-03T00:00:00.000Z",
    ...fields,
  }) as Connection.Incoming

const chatFrames: ReadonlyArray<Connection.Incoming> = [
  runEvent(0, { _tag: "TurnStarted", turn: 0 }),
  runEvent(1, {
    _tag: "ModelResponseCommitted",
    turn: 0,
    operationKey: "capstone-run:model:0",
    modelCallId: "model-call-0",
    modelAttemptId: "model-attempt-0",
    attempt: 0,
    sessionId: "capstone-session",
    sessionParentId: null,
    sessionEntryId: "entry-response-0",
    digest: "response-digest-0",
    response: { content: [Response.makePart("text", { text: "deterministic response" })] },
  }),
  runEvent(2, { _tag: "TurnCompleted", turn: 0 }),
  runEvent(3, {
    _tag: "RunCompleted",
    result: {
      text: "deterministic response",
      turns: 1,
      session: { sessionId: "capstone-session", leafId: "entry-response-0" },
    },
  }),
]

const [chatModel] = Chat.update(
  Chat.initialModel("capstone-session"),
  Chat.ReceivedAgent({ incoming: Connection.ConnectionOpened() }),
)
const renderedChat = chatFrames.reduce(
  (model, frame) => Chat.update(model, Chat.ReceivedAgent({ incoming: frame }))[0],
  chatModel,
)

const program = Effect.gen(function* () {
  const source = yield* SkillSource.SkillSource
  const skills = yield* source.all
  const result = yield* ModelRegistry.operate(
    { provider: "deterministic", model: "capstone" },
    Agent.generate(agent, { prompt: "Use the research skill before answering.", memory: { key } }),
  )
  yield* Console.log(`skills=${skills.length} chatEntries=${renderedChat.entries.length} text=${result.text}`)
  yield* Effect.succeed(filesystemSkillLayer)
})

const runtimeLayer = Layer.mergeAll(
  Deterministic.layer({ model: "capstone" }),
  toolkitLayer,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
  SkillSource.layerSkills([researchSkill]),
  WorkingMemory.layer({ maxMessages: 4 }),
  Connection.layerTest({ frames: () => Stream.empty, send: () => Effect.void }),
  compactionLayer,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
