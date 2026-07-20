import extract from "../../snippets/guides/structured-output/extract.ts?raw"
import extractExpected from "../../snippets/guides/structured-output/extract.expected.txt?raw"
import streamObject from "../../snippets/guides/structured-output/stream-object.ts?raw"
import streamObjectExpected from "../../snippets/guides/structured-output/stream-object.expected.txt?raw"
import { bullets, callout, code, codeBlock, definePage, h2, link, p } from "../../prose"
export const structuredOutput = definePage({
  path: "/docs/guides/structured-output",
  title: "How to get schema-validated output",
  navTitle: "Structured output",
  group: "Guides",
  description:
    "End a run with a typed value: generate and stream accept an output option for one terminal turn validated by Effect Schema.",
  content: [
    p(
      "When the caller needs a typed value instead of prose, run the agent with ",
      code("Agent.generate"),
      " or ",
      code("Agent.stream"),
      ". The normal loop runs first (tools, turns, policies all apply), then one terminal turn asks the model for output matching your Schema. Invalid output fails the run loudly; it never returns untyped data.",
    ),
    h2("define-the-schema", "1. Define the schema and fold to a value"),
    p(
      "Pass any Effect ",
      code("Schema"),
      " struct codec as ",
      code("output.schema"),
      ". ",
      code("generate"),
      " folds the stream and returns ",
      code("result.value"),
      " already decoded to the schema's type:",
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
      code("stream"),
      " is the same run as ",
      code("stream"),
      " plus a trailing ",
      code("StructuredOutput"),
      " event before ",
      code("Completed"),
      ". Use it when a UI should show the loop working before the typed value lands:",
    ),
    codeBlock({ label: "stream-object.ts", source: streamObject, expectedOutput: streamObjectExpected }),
    h2("name-and-prompt", "3. Name the output and tune the terminal prompt"),
    p(
      "Two fields in ",
      code("output"),
      " shape the terminal turn. ",
      code("name"),
      " names the output structure for the provider (default ",
      code('"output"'),
      "); ",
      code("prompt"),
      " replaces the default instruction (",
      code('"Return the final structured output for the task above."'),
      ") when your schema needs more guidance.",
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
