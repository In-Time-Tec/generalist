import { Console, Effect, Layer, ManagedRuntime, Stream } from "effect"
import { Agent, Approvals, Guardrail, LanguageModel, ModelMiddleware, Prompt, Response, ToolExecutor } from "generalist"

const lastUserText = (prompt: Prompt.Prompt): string => {
  const userMessages = prompt.content.filter((message) => message.role === "user")
  const last = userMessages.at(-1)
  if (last === undefined) return ""
  for (const part of last.content) {
    if (part.type === "text") return part.text
  }
  return ""
}

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: (options) =>
      Stream.make(
        Response.makePart("text-delta", {
          id: "assistant",
          delta: `Received: ${lastUserText(options.prompt)} Escalate to oncall@example.com if needed.`,
        }),
      ),
  }),
)

const agent = Agent.make({ name: "support-agent" })

const middlewareLayer = ModelMiddleware.layer([
  Guardrail.redactInput({ pattern: /\d{3}-\d{2}-\d{4}/g, replacement: "[ssn]" }),
  Guardrail.redactOutput({ pattern: /[\w.-]+@[\w.-]+\.\w+/g, replacement: "[email]" }),
])

const program = Agent.generate(agent, { prompt: "My SSN is 123-45-6789, please update my record." }).pipe(
  Effect.flatMap((result) => Console.log(result.text)),
)

const runtimeLayer = Layer.mergeAll(
  modelLayer,
  ToolExecutor.layerTest({ execute: () => Effect.die("this agent has no tools") }),
  Approvals.layerAutoApprove,
  middlewareLayer,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
