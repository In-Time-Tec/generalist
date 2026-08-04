import { Console, Effect, Layer, Schema, Stream } from "effect"
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
} from "@batonfx/core"
import { Chat, Connection } from "@batonfx/foldkit"
import { WorkingMemory } from "@batonfx/memory"
import { Deterministic } from "@batonfx/providers"
import { SkillLoader } from "@batonfx/skills"
import { AgentRef, RunEvent } from "@batonfx/runtime"
import { Prompt } from "effect/unstable/ai"

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

const chatAgent = AgentRef.make({ id: "capstone-assistant", version: "1", digest: "sha256:capstone" })
const runEvent = (sequence: number, fields: Record<string, unknown>): RunEvent.RunEvent =>
  ({
    specVersion: "1",
    eventId: `capstone-run:${sequence}`,
    runId: "capstone-run",
    sequence,
    agent: chatAgent,
    rootRunId: "capstone-run",
    occurredAt: "2026-08-03T00:00:00.000Z",
    ...fields,
  }) as RunEvent.RunEvent

const chatFrames: ReadonlyArray<Connection.Incoming> = [
  runEvent(0, { _tag: "TurnStarted", turn: 0 }),
  runEvent(1, {
    _tag: "ModelPart",
    turn: 0,
    modelCallId: "model-call-0",
    modelAttemptId: "model-attempt-0",
    attempt: 0,
    part: Response.makePart("text-delta", { id: "assistant", delta: "deterministic response" }),
  }),
  runEvent(2, { _tag: "TurnCompleted", turn: 0, transcript: Prompt.empty }),
  runEvent(3, {
    _tag: "RunCompleted",
    result: {
      text: "deterministic response",
      turns: 1,
      transcript: Prompt.empty,
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
}).pipe(
  Effect.provide(
    Layer.mergeAll(
      Deterministic.layer({ model: "capstone" }),
      toolkitLayer,
      Approvals.layerAutoApprove,
      ModelMiddleware.layerIdentity,
      SkillSource.layerSkills([researchSkill]),
      WorkingMemory.layer({ maxMessages: 4 }),
      Connection.layerTest({ frames: () => Stream.empty, send: () => Effect.void }),
      compactionLayer,
    ),
  ),
)

await Effect.runPromise(program)
