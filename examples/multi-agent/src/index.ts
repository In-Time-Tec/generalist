import { Console, Effect, Layer, ManagedRuntime, Stream } from "effect"
import { Agent, Approvals, Handoff, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { LanguageModel, Response } from "effect/unstable/ai"

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
  { registration: Handoff.register(Agent.make({ name: "planner" }), modelLayer), prompt: "Plan the work" },
  { registration: Handoff.register(Agent.make({ name: "reviewer" }), modelLayer), prompt: "Review the work" },
]

const program = Handoff.fanOut(children, { concurrency: 2 }).pipe(
  Effect.flatMap((results) => Console.log(results.join("\n"))),
)

const runtimeLayer = Layer.mergeAll(
  ToolExecutor.layerTest({ execute: () => Effect.die("unexpected tool call") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
