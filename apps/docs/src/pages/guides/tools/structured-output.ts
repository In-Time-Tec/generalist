import extract from "virtual:source/src/snippets/guides/tools/structured-output/extract.ts"
import extractExpected from "virtual:source/src/snippets/guides/tools/structured-output/extract.expected.txt"
import streamObject from "virtual:source/src/snippets/guides/tools/structured-output/stream-object.ts"
import streamObjectExpected from "virtual:source/src/snippets/guides/tools/structured-output/stream-object.expected.txt"
import { bullets, callout, code, codeBlock, definePage, h2, link, p } from "../../../prose"
export const structuredOutput = definePage({
  path: "/docs/guides/structured-output",
  title: "How to get schema-validated output",
  navTitle: "Structured output",
  group: "Guides",
  description:
    "Declare an Agent output Schema, return its decoded type from run, and observe it on the terminal Completed event.",
  content: [
    p(
      "When the caller needs a typed value instead of prose, declare the Agent's ",
      code("output"),
      " Schema and call ",
      code("Agent.run"),
      " or ",
      code("Agent.stream"),
      ". The normal loop runs first, then one terminal turn asks the model for output matching that Schema. Invalid output fails with ",
      code("InvalidOutput"),
      "; untyped data never escapes.",
    ),
    h2("define-the-schema", "1. Define the Agent's output"),
    p(
      "Pass any Effect ",
      code("Schema"),
      " as ",
      code("Agent.make({ output })"),
      ". ",
      code("run"),
      " returns the decoded value directly, and its Effect type is derived from the schema:",
    ),
    codeBlock({ label: "extract.ts", source: extract, expectedOutput: extractExpected }),
    callout(
      "info",
      "Two model paths",
      "The loop turns use ",
      code("streamText"),
      "; the terminal structured turn uses ",
      code("generateText"),
      ". A scripted model for tests must implement both, which is also why this snippet runs with zero credentials.",
    ),
    h2("stream-the-events", "2. Stream the run when you need the events"),
    p(
      code("Agent.stream"),
      " exposes the same agent loop as ",
      code("Agent.run"),
      ", including one normalized ",
      code("ModelResponseCommitted"),
      " for each completed model operation. The trailing ",
      code("Completed"),
      " event carries the typed ",
      code("output"),
      ". Use it when a consumer should observe semantic loop progress before the value lands:",
    ),
    codeBlock({ label: "stream-object.ts", source: streamObject, expectedOutput: streamObjectExpected }),
    h2("input-and-output", "3. Type both sides of the Agent"),
    p(
      code("input"),
      " and ",
      code("output"),
      " both default to ",
      code("Schema.String"),
      ". Declaring an input struct makes the second argument of ",
      code("run"),
      " and ",
      code("stream"),
      " that struct's decoded type; Generalist encodes it before composing the first model prompt.",
    ),
    callout(
      "warning",
      "The terminal turn does not execute tools",
      "Tool use belongs to the loop turns before it. If the model must gather data, let the loop do that first; the structured turn only formats what the transcript already contains.",
    ),
    h2("next-steps", "Next steps"),
    bullets(
      [
        "Bound how many loop turns run before the terminal turn: ",
        link("/docs/guides/turn-policy", "How to control turn budgets"),
        ".",
      ],
      [
        "Assert structured results in CI: ",
        link("/docs/guides/testing-evals", "How to test agents and run evals in CI"),
        ".",
      ],
    ),
  ],
})
