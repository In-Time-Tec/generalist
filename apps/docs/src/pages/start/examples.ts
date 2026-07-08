import * as Prose from "../../prose"

const cloneSource = `git clone https://github.com/In-Time-Tec/batonfx
cd batonfx
bun install`

export const examples = Prose.definePage({
  path: "/docs/start/examples",
  title: "Examples",
  navTitle: "Examples",
  group: "Start",
  description:
    "The nine runnable examples in the Batonfx repository: what each one shows and the one command that runs it.",
  content: [
    Prose.lead(
      "The repository ships nine runnable examples, typechecked in CI. All but one run offline with scripted models — no API keys.",
    ),
    Prose.codeBlock({ label: "Terminal", language: "bash", source: cloneSource }),
    Prose.h2("the-examples", "The examples"),
    Prose.table(
      ["Example", "What it shows", "Run"],
      [
        [
          [Prose.code("tool-calling-chatbot")],
          "An offline agent that emits a tool call, executes it through a ToolExecutor, and returns a final answer",
          [Prose.code("bun --cwd examples/tool-calling-chatbot start")],
        ],
        [
          [Prose.code("eval-in-ci")],
          [
            "A deterministic no-credential smoke eval over ",
            Prose.code("Agent.generate"),
            " using the ModelRegistry.provide pattern",
          ],
          [Prose.code("bun --cwd examples/eval-in-ci start")],
        ],
        [
          [Prose.code("structured-extraction")],
          [
            "An offline ",
            Prose.code("Agent.generateObject"),
            " run that validates terminal model output with Effect Schema",
          ],
          [Prose.code("bun --cwd examples/structured-extraction start")],
        ],
        [
          [Prose.code("hitl-over-sse")],
          "An approval suspension captured as replayable transport frames from an in-process session registry",
          [Prose.code("bun --cwd examples/hitl-over-sse start")],
        ],
        [
          [Prose.code("multi-agent")],
          ["Same-process ", Prose.code("Handoff.fanOut"), " with two child agents sharing a local model layer"],
          [Prose.code("bun --cwd examples/multi-agent start")],
        ],
        [
          [Prose.code("memory-chat")],
          "Two local turns with the same memory key; the second turn receives working-memory recall",
          [Prose.code("bun --cwd examples/memory-chat start")],
        ],
        [
          [Prose.code("mcp-agent")],
          [
            "An agent over a fake in-memory MCP source using the ",
            Prose.code("@batonfx/mcp/baton"),
            " adapter shape of a real connection",
          ],
          [Prose.code("bun --cwd examples/mcp-agent start")],
        ],
        [
          [Prose.code("capstone-local-assistant")],
          "All seven packages composed in one offline program: core loop, deterministic provider, skills, memory, wire frames, and the headless chat update",
          [Prose.code("bun --cwd examples/capstone-local-assistant start")],
        ],
        [
          [Prose.code("deep-research-agent")],
          "The full server-plus-browser app: a web_search tool, SSE and WebSocket transport, and a styled FoldKit chat UI",
          [Prose.code("bun --cwd examples/deep-research-agent start")],
        ],
      ],
    ),
    Prose.p(
      Prose.code("deep-research-agent"),
      " starts the server; run the web UI beside it with ",
      Prose.code("bun --cwd examples/deep-research-agent web"),
      ". It uses canned search results and a scripted model until you set ",
      Prose.code("EXA_API_KEY"),
      " and ",
      Prose.code("OPENROUTER_API_KEY"),
      ". The tutorial that builds it from scratch is ",
      Prose.link("/docs/start/research-agent", "Tutorial: a research agent"),
      ".",
    ),
  ],
})
