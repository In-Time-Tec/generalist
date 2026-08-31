import { Console, Effect, Layer, ManagedRuntime, Stream } from "effect"
import { Agent, Approvals, LanguageModel, ModelMiddleware, Response, SkillCatalog, ToolExecutor } from "generalist"

const releaseNotesSkill: SkillCatalog.Skill = {
  name: "release-notes",
  description: "Draft release notes from merged changes before announcing a version.",
  allowedTools: ["read_file", "search_docs"],
  instructions: Effect.succeed("Group changes by package and write one sentence per change."),
  tools: [],
}

const agent = Agent.make({ name: "release-assistant", instructions: "Use skills when they match the task." })

let calls = 0

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: (options) => {
      calls += 1
      if (calls === 1) {
        return Stream.make(
          Response.makePart("tool-call", {
            id: "skill-1",
            name: "activate_skill",
            params: { name: "release-notes" },
            providerExecuted: false,
          }),
        )
      }
      const bodyLoaded = JSON.stringify(options.prompt.content).includes("one sentence per change")
      return Stream.make(
        Response.makePart("text-delta", {
          id: "assistant",
          delta: bodyLoaded ? "Skill body loaded; drafting the release notes." : "Skill body missing.",
        }),
      )
    },
  }),
)

const program = Effect.gen(function* () {
  const result = yield* Agent.generate(agent, { prompt: "Draft release notes for 0.2.0." })
  yield* Console.log(result.text)
})

const runtimeLayer = Layer.mergeAll(
  modelLayer,
  ToolExecutor.layerTest({ execute: () => Effect.die("activate_skill is handled by the loop, not the executor") }),
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
  SkillCatalog.layerSkills([releaseNotesSkill]),
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
