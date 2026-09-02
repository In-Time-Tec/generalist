import { code, codeBlock, definePage, h2, lead, link, p, table } from "../../prose"
const cloneSource = `git clone https://github.com/In-Time-Tec/generalist
cd generalist
bun install`

export const examples = definePage({
  path: "/docs/start/examples",
  title: "Examples",
  navTitle: "Examples",
  group: "Start",
  description:
    "The nine runnable examples in the Generalist repository: what each one shows and the one command that runs it.",
  content: [
    lead(
      "The repository ships nine runnable examples, typechecked in CI. All but one run offline with scripted models, no API keys.",
    ),
    codeBlock({ label: "Terminal", language: "bash", source: cloneSource }),
    h2("the-examples", "The examples"),
    table(
      ["Example", "What it shows", "Run"],
      [
        [
          [code("tool-calling-chatbot")],
          "An offline agent that emits a tool call, executes it through a ToolExecutor, and returns a final answer",
          [code("bun --cwd examples/tool-calling-chatbot start")],
        ],
        [
          [code("eval-in-ci")],
          [
            "A deterministic no-credential smoke eval over ",
            code("Agent.run"),
            " using the ModelRegistry.withModel pattern",
          ],
          [code("bun --cwd examples/eval-in-ci start")],
        ],
        [
          [code("structured-extraction")],
          ["An offline ", code("Agent.run"), " call that validates terminal model output with Effect Schema"],
          [code("bun --cwd examples/structured-extraction start")],
        ],
        [
          [code("hitl-over-sse")],
          "An approval suspension captured as canonical RunEvents from Runtime.layerMemory and encoded for SSE",
          [code("bun --cwd examples/hitl-over-sse start")],
        ],
        [
          [code("multi-agent")],
          ["Typed ", code("Agent.fanOut"), " with two child agents and the deterministic provider"],
          [code("bun --cwd examples/multi-agent start")],
        ],
        [
          [code("memory-chat")],
          "Two local turns with the same memory key; the second turn receives working-memory recall",
          [code("bun --cwd examples/memory-chat start")],
        ],
        [
          [code("mcp-agent")],
          [
            "An agent over a fake in-memory MCP client using the ",
            code("generalist/unstable/mcp/tools"),
            " adapter shape of a real connection",
          ],
          [code("bun --cwd examples/mcp-agent start")],
        ],
        [
          [code("capstone-local-assistant")],
          "The runtime packages composed in one offline program: core loop, deterministic provider, skills, memory, wire frames, and the headless chat update",
          [code("bun --cwd examples/capstone-local-assistant start")],
        ],
        [
          [code("deep-research-agent")],
          "The full server-plus-browser app: a web_search tool, SSE and WebSocket transport, and a styled FoldKit chat UI",
          [code("bun --cwd examples/deep-research-agent start")],
        ],
      ],
    ),
    p(
      code("deep-research-agent"),
      " starts the server; run the web UI beside it with ",
      code("bun --cwd examples/deep-research-agent web"),
      ". It uses canned search results and a scripted model until you set ",
      code("EXA_API_KEY"),
      " and ",
      code("OPENROUTER_API_KEY"),
      ". The tutorial that builds it from scratch is ",
      link("/docs/start/research-agent", "Tutorial: a research agent"),
      ".",
    ),
  ],
})
