import { Console, Effect, Layer, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import { Agent, Approvals, Handoff, ModelMiddleware, ToolExecutor } from "@batonfx/core"

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: (options) =>
      Stream.make(
        Response.makePart("text-delta", {
          id: "assistant",
          delta: `done: ${JSON.stringify(options.prompt.content).slice(0, 32)}`,
        }),
      ),
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
      ToolExecutor.testLayer({ execute: () => Effect.die("unexpected tool call") }),
      Approvals.autoApprove,
      ModelMiddleware.identityLayer,
    ),
  ),
)

await Effect.runPromise(program)
