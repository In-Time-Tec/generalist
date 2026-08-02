import { Schema } from "effect"
import { LanguageModel, Tool, Toolkit } from "effect/unstable/ai"
import { expectTypeOf, it } from "vitest"
import { adapt } from "../src/model/model-service.js"

const apiContract = (model: LanguageModel.Service) => {
  const service = adapt(model, {})
  const exact: LanguageModel.Service = service
  const plain = exact.generateText({ prompt: "plain" })
  const streamed = exact.streamText({ prompt: "streamed" })
  const object = exact.generateObject({ prompt: "object", schema: Schema.Struct({ value: Schema.String }) })
  const toolkit = Toolkit.make(Tool.make("lookup"))
  const withToolkit = exact.generateText({ prompt: "tool", toolkit })
  const withToolkitStream = exact.streamText({ prompt: "tool", toolkit })
  return [plain, streamed, object, withToolkit, withToolkitStream]
}

it("preserves the LanguageModel.Service overload contract", () => {
  expectTypeOf(apiContract).toBeFunction()
})
