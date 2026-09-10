import { Effect, Layer, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Response } from "effect/unstable/ai"
import { buggySource, fixedSource, fixturePath } from "./fixture.js"

type ProviderOptions = Parameters<Parameters<typeof LanguageModel.make>[0]["streamText"]>[0]

const usage = Response.Usage.make({
  inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
})

const finish = (reason: Response.FinishReason) => Response.makePart("finish", { reason, usage, response: undefined })
const ToolNames = Schema.Array(Schema.Struct({ name: Schema.String }))
const resultNames = (prompt: Prompt.Prompt): ReadonlySet<string> => {
  const names = new Set<string>()
  for (const message of prompt.content) {
    if (message.role !== "tool") continue
    for (const part of message.content) {
      if (part.type === "tool-result") names.add(part.name)
    }
  }
  return names
}
const call = (id: string, name: string, params: Schema.Json) =>
  Stream.make(Response.makePart("tool-call", { id, name, params, providerExecuted: false }), finish("tool-calls"))
const text = (id: string, value: string) =>
  Stream.make(Response.makePart("text-delta", { id, delta: value }), finish("stop"))

const parentTurn = (results: ReadonlySet<string>) => {
  if (!results.has("read_file")) return call("lead-read", "read_file", { path: fixturePath })
  if (!results.has("delegate_specialists")) {
    return call("lead-delegate", "delegate_specialists", {
      children: [
        { agent: "reviewer", input: "Review the minimal fix for average([]) returning NaN." },
        { agent: "test-writer", input: "Find the regression test missing for average([])." },
      ],
      concurrency: 2,
      onFailure: "collect",
    })
  }
  if (!results.has("apply_patch")) {
    return call("lead-patch", "apply_patch", { path: fixturePath, before: buggySource, after: fixedSource })
  }
  if (!results.has("run_tests")) return call("lead-tests", "run_tests", { path: fixturePath, source: fixedSource })
  return text("lead-complete", "Fixed average([]) to return 0; all three fixture cases pass.")
}

const reviewerTurn = (results: ReadonlySet<string>) => {
  if (!results.has("read_file")) return call("review-read", "read_file", { path: fixturePath })
  const note = "Review: guard values.length === 0 before division and leave non-empty behavior unchanged."
  if (!results.has("send_specialist_note"))
    return call("review-note", "send_specialist_note", { idempotencyKey: "specialist-note:reviewer", message: note })
  return text("review-complete", note)
}

const testWriterTurn = (results: ReadonlySet<string>) => {
  if (!results.has("run_tests")) return call("tests-run", "run_tests", { path: fixturePath, source: buggySource })
  const note = "Tests: assert average([]) === 0; the empty case fails before the fix while both non-empty cases pass."
  if (!results.has("send_specialist_note"))
    return call("tests-note", "send_specialist_note", { idempotencyKey: "specialist-note:test-writer", message: note })
  return text("tests-complete", note)
}

const stream = (options: ProviderOptions) => {
  const tools = new Set(Schema.decodeSync(ToolNames)(options.tools).map((tool) => tool.name))
  const results = resultNames(options.prompt)
  if (tools.has("delegate_specialists")) return parentTurn(results)
  if (tools.has("run_tests")) return testWriterTurn(results)
  return reviewerTurn(results)
}

export const scriptedModelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.die("The coding-agent fixture only exercises streamed model turns"),
    streamText: stream,
  }),
)
