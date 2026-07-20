import { Console, Effect, Layer, Stream } from "effect"
import { Agent, Approvals, Handoff, LanguageModel, ModelMiddleware, Response, ToolExecutor } from "@batonfx/core"

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: (options) => {
      const task = JSON.stringify(options.prompt.content).match(/(Plan|Review) the work/)?.[0] ?? "unknown task"
      return Stream.make(Response.makePart("text-delta", { id: "assistant", delta: `finished: ${task}` }))
    },
  }),
)

const children = [
  { agent: Agent.make({ name: "planner" }), prompt: "Plan the work" },
  { agent: Agent.make({ name: "reviewer" }), prompt: "Review the work" },
]

const program = Handoff.fanOut(children, { concurrency: 2 }).pipe(
  Effect.flatMap((results) => Console.log(results.map((result) => result.text).join("\n"))),
  Effect.provide(
    Layer.mergeAll(
      modelLayer,
      ToolExecutor.layerTest({ execute: () => Effect.die("fanOut children have no tools") }),
      Approvals.layerAutoApprove,
      ModelMiddleware.layerIdentity,
    ),
  ),
)

await Effect.runPromise(program)
