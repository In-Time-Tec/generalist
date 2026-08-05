import setupSource from "../../snippets/research-agent/setup.sh?raw"
import searchProviderSource from "../../snippets/research-agent/search-provider.ts?raw"
import toolsSource from "../../snippets/research-agent/tools.ts?raw"
import modelSource from "../../snippets/research-agent/model.ts?raw"
import agentSource from "../../snippets/research-agent/agent.ts?raw"
import serverSource from "../../snippets/research-agent/server.ts?raw"
import mainSource from "../../snippets/research-agent/main.txt?raw"
import openSessionSource from "../../snippets/research-agent/open-session.sh?raw"
import openSessionOutput from "../../snippets/research-agent/open-session-output.txt?raw"
import eventsSource from "../../snippets/research-agent/events.sh?raw"
import eventsOutput from "../../snippets/research-agent/events-output.txt?raw"
import approveSource from "../../snippets/research-agent/approve.ts?raw"
import approveOutput from "../../snippets/research-agent/approve-output.txt?raw"
import webSetupSource from "../../snippets/research-agent/web-setup.sh?raw"
import webIndexSource from "../../snippets/research-agent/web-index.html?raw"
import webMainSource from "../../snippets/research-agent/web-main.ts?raw"
import { bullets, code, codeBlock, definePage, h2, h3, lead, link, p } from "../../prose"
export const researchAgent = definePage({
  path: "/docs/start/research-agent",
  title: "Tutorial: a research agent with approvals and a live UI",
  navTitle: "Tutorial: research agent",
  group: "Start",
  description:
    "Build a research agent with a real web_search tool, human approval over the wire, and a streaming FoldKit chat UI: zero-credential by default, live with one env var.",
  content: [
    lead(
      "In this tutorial we build a research agent with a real web_search tool, human approval, and a streaming FoldKit chat UI. It runs with zero credentials by default and goes live against a real model with one environment variable.",
    ),
    p(
      "Three parts: a Bun server that streams agent runs over SSE and WebSocket, an approval resolved over the wire, and a browser chat UI. If you have not done ",
      link("/docs/start/quickstart", "the quickstart"),
      ", start there. The finished, styled version of this app lives in the repository at ",
      link(
        "https://github.com/In-Time-Tec/batonfx/tree/main/examples/deep-research-agent",
        "examples/deep-research-agent",
      ),
      ".",
    ),
    h2("part-1-the-server", "Part 1: The server"),
    h3("scaffold-the-server", "Scaffold the server"),
    codeBlock({ label: "Terminal", language: "bash", source: setupSource }),
    h3("a-search-provider-service", "A search provider service"),
    p(
      "Tools should not talk to the outside world directly; they resolve services you own. Ours answers every query with canned results so the tutorial runs offline; swapping in a real search API later means swapping this one layer.",
    ),
    codeBlock({ label: "search-provider.ts", source: searchProviderSource }),
    h3("the-web-search-tool", "The web_search tool"),
    p(
      code("Tool.make"),
      " declares the name, parameter schema, and success schema; ",
      code("dependencies"),
      " names the service the handler resolves; ",
      code('failureMode: "return"'),
      " feeds tool failures back to the model as results. The one line that changes everything downstream is ",
      code("needsApproval: true"),
      ". This tool will not run without a human decision.",
    ),
    codeBlock({ label: "tools.ts", source: toolsSource }),
    h3("a-model-with-a-deterministic-fallback", "A model with a deterministic fallback"),
    p(
      "When ",
      code("OPENROUTER_API_KEY"),
      " resolves, the layer is a real OpenRouter model. When it does not, a scripted model stands in: it reads the growing prompt, where no prior ",
      code("web_search"),
      " result means emit a tool call; a prior result means synthesize a cited answer from it.",
    ),
    codeBlock({ label: "model.ts", source: modelSource }),
    h3("the-agent", "The agent"),
    codeBlock({ label: "agent.ts", source: agentSource }),
    h3("runtime-and-routes", "Runtime and routes"),
    p(
      code("Runtime.layerMemory"),
      " registers the agent at an address and publishes canonical replayable RunEvents. The server claims each admitted in-memory execution through ",
      code("RunStore"),
      " and runs it with ",
      code("ExecutionHost"),
      ". The approvals layer returns ",
      code("Pending"),
      " so approval-gated tools park the run until a human resolves its wait. The routes expose Runtime over HTTP: ",
      code("GET /ws"),
      " for WebSocket, ",
      code("GET /runs/:id/events"),
      " for SSE, and ",
      code("POST /runs"),
      " to admit a message.",
    ),
    codeBlock({ label: "server.ts", source: serverSource }),
    h3("serve-it-with-bun", "Serve it with Bun"),
    p(
      "The entrypoint provides the platform HTTP server from ",
      code("@effect/platform-bun"),
      " and launches the layer. Start it with ",
      code("bun run index.ts"),
      ":",
    ),
    codeBlock({ label: "index.ts", source: mainSource }),
    h3("watch-a-run-suspend", "Watch a run suspend"),
    p("With the server running, admit a run with a stable run ID, session ID, and idempotency key:"),
    codeBlock({
      label: "Terminal",
      language: "bash",
      source: openSessionSource,
      expectedOutput: openSessionOutput,
    }),
    p("Then tail the SSE stream:"),
    codeBlock({ label: "Terminal", language: "bash", source: eventsSource, expectedOutput: eventsOutput }),
    p(
      "Read the RunEvents in order: the model planned a ",
      code("tool-call"),
      ", ",
      code("ApprovalRequested"),
      " was emitted, and then the run parked. The ",
      code("Suspended"),
      code("RunWaiting"),
      " event carries the open wait. Every event has a monotonic ",
      code("sequence"),
      ", which is the replay cursor a reconnecting client resumes from.",
    ),
    h2("part-2-approvals-over-the-wire", "Part 2: Approvals over the wire"),
    p(
      "The run is waiting rather than failed. Its open wait is addressed by ",
      code('waitId: "search-1"'),
      ". ",
      link("/docs/learn/suspension", "Suspension as a typed error"),
      " explains the underlying typed suspension. To resume, an authenticated command route calls ",
      code("Runtime.respond"),
      ". This script approves the open wait through that route:",
    ),
    codeBlock({ label: "approve.ts", source: approveSource, expectedOutput: approveOutput }),
    p(
      "The stream resumes, the tool executes, the second model turn synthesizes, and the run ends. The ",
      code("Completed"),
      " event carries the cited answer built from the search results. With ",
      code("OPENROUTER_API_KEY"),
      " set, the same frames carry a real model's answer instead.",
    ),
    h2("part-3-the-foldkit-ui", "Part 3: The FoldKit UI"),
    h3("scaffold-the-web-app", "Scaffold the web app"),
    codeBlock({ label: "Terminal", language: "bash", source: webSetupSource }),
    codeBlock({ label: "index.html", language: "html", source: webIndexSource }),
    h3("wire-the-chat", "Wire the chat"),
    p(
      code("@batonfx/foldkit"),
      " ships a headless chat submodel that does the frame decoding, streaming assembly, and approval state for you. The program embeds ",
      code("Chat.Model"),
      " in its own model, forwards ",
      code("Chat.subscriptions"),
      " with ",
      code("Subscription.lift"),
      ", routes every child action through a ",
      code("GotChatAction"),
      " wrapper, and provides the connection as a layer: ",
      code("Connection.layerWebSocket"),
      ". When ",
      code("model.chat.run"),
      " is ",
      code("AwaitingApproval"),
      ", the view renders Approve and Deny buttons dispatching ",
      code("Chat.ClickedApprove"),
      " and ",
      code("Chat.ClickedDeny"),
      ". That is the same wire frame Part 2 sent by hand.",
    ),
    codeBlock({ label: "main.ts", source: webMainSource }),
    p("Run ", code("bunx vite"), " next to the ", code("index.html"), " and open the printed URL."),
    h2("success", "You have built the whole thing"),
    p(
      "Ask a question in the browser; the agent pauses with an approval card; click Approve; watch the answer stream in live. Set ",
      code("OPENROUTER_API_KEY"),
      " and restart the server to run the same flow against a real model.",
    ),
    h2("next-steps", "Next steps"),
    bullets(
      [
        "The transport in depth (replay cursors, snapshots, busy sessions): ",
        link("/docs/guides/serve-transport", "How to serve an agent over SSE and WebSocket"),
        ".",
      ],
      [
        "The chat model in depth (entries, streaming, reconnect states): ",
        link("/docs/guides/foldkit-chat", "How to build a chat UI with FoldKit"),
        ".",
      ],
      [
        "Where durability lives when runs must survive restarts: ",
        link("/docs/learn/native-runtime", "Core and Runtime"),
        ".",
      ],
    ),
  ],
})
