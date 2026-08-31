import { Console, Effect, Layer, ManagedRuntime, Stream } from "effect"
import { Agent, Approvals, Handoff, LanguageModel, ModelMiddleware, Response, ToolExecutor } from "generalist"

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
  { registration: Handoff.register(Agent.make({ name: "planner" }), modelLayer), prompt: "Plan the work" },
  { registration: Handoff.register(Agent.make({ name: "reviewer" }), modelLayer), prompt: "Review the work" },
]

const program = Handoff.fanOut(children, { concurrency: 2 }).pipe(
  Effect.flatMap((results) => Console.log(results.map((result) => result.text).join("\n"))),
)

const runtimeLayer = Layer.mergeAll(
  ToolExecutor.layerTest({ execute: () => Effect.die("fanOut children have no tools") }),
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
