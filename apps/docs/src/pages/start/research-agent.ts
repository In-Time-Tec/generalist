import setupSource from "virtual:source/src/snippets/research-agent/demo/setup.sh"
import webSearchSource from "virtual:source/src/snippets/research-agent/web-search.ts"
import toolsSource from "virtual:source/src/snippets/research-agent/tools.ts"
import modelSource from "virtual:source/src/snippets/research-agent/model.ts"
import agentSource from "virtual:source/src/snippets/research-agent/agent.ts"
import serverSource from "virtual:source/src/snippets/research-agent/server.ts"
import mainSource from "virtual:source/src/snippets/research-agent/demo/main.txt"
import openSessionSource from "virtual:source/src/snippets/research-agent/demo/open-session.sh"
import openSessionOutput from "virtual:source/src/snippets/research-agent/demo/open-session-output.txt"
import eventsSource from "virtual:source/src/snippets/research-agent/demo/events.sh"
import eventsOutput from "virtual:source/src/snippets/research-agent/demo/events-output.txt"
import approveSource from "virtual:source/src/snippets/research-agent/approve.ts"
import approveOutput from "virtual:source/src/snippets/research-agent/demo/approve-output.txt"
import webSetupSource from "virtual:source/src/snippets/research-agent/web/setup.sh"
import webIndexSource from "virtual:source/src/snippets/research-agent/web/index.html"
import webMainSource from "virtual:source/src/snippets/research-agent/web/main.ts"
import { bullets, code, codeBlock, definePage, h2, h3, lead, link, p } from "../../prose"
export const researchAgent = definePage({
  path: "/docs/start/research-agent",
  title: "Tutorial: a research agent with approvals and a live UI",
  navTitle: "Tutorial: research agent",
  group: "Start",
  description:
    "Build a research agent with a real web_search tool, human approval over the wire, and a live FoldKit chat UI: zero-credential by default, live with one env var.",
  content: [
    lead(
      "In this tutorial we build a research agent with a real web_search tool, human approval, and a live FoldKit chat UI. It runs with zero credentials by default and goes live against a real model with one environment variable.",
    ),
    p(
      "Three parts: a Bun server that streams agent runs over SSE and WebSocket, an approval resolved over the wire, and a browser chat UI. If you have not done ",
      link("/docs/start/quickstart", "the quickstart"),
      ", start there. The finished, styled version of this app lives in the repository at ",
      link(
        "https://github.com/In-Time-Tec/generalist/tree/main/examples/deep-research-agent",
        "examples/deep-research-agent",
      ),
      ".",
    ),
    h2("part-1-the-server", "Part 1: The server"),
    h3("scaffold-the-server", "Scaffold the server"),
    codeBlock({ label: "Terminal", language: "bash", source: setupSource }),
    h3("a-web-search-service", "A web search service"),
    p(
      "Tools should not talk to the outside world directly; they resolve services you own. Ours answers every query with canned results so the tutorial runs offline; swapping in a real search API later means swapping this one layer.",
    ),
    codeBlock({ label: "web-search.ts", source: webSearchSource }),
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
      " owns durable execution, while ",
      code("Generalist.create"),
      " creates the product-facing Host that owns Sessions, named Agents, Runs, approvals, and the Session event cursor. The approvals layer parks an approval-gated tool until a human resolves its durable token. ",
      code("Server.layer"),
      " mounts that Host through one typed API: ",
      code("POST /sessions"),
      " creates a Session, ",
      code("POST /sessions/:sessionId/runs"),
      " starts a configured Agent, and ",
      code("GET /sessions/:id/events"),
      " and ",
      code("GET /sessions/:id/ws"),
      " follow the same HostEvent stream over SSE and WebSocket.",
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
    p(
      "With the server running, create a stable Session and start the named Agent with an idempotency key. Keep both the Session ID used by the event stream and the returned Run ID:",
    ),
    codeBlock({
      label: "Terminal",
      language: "bash",
      source: openSessionSource,
      expectedOutput: openSessionOutput,
    }),
    p("Then tail the SSE stream:"),
    codeBlock({ label: "Terminal", language: "bash", source: eventsSource, expectedOutput: eventsOutput }),
    p(
      "Read the HostEvents in order: the Run started, the model planned a ",
      code("tool-call"),
      ", ",
      code("ApprovalRequested"),
      " was emitted, and then the Run parked before tool execution. Every HostEvent has a durable Session ",
      code("cursor"),
      ". A reconnect resumes strictly after that cursor; visible cursor values need not be consecutive because Host intentionally filters internal Runtime events.",
    ),
    h2("part-2-approvals-over-the-wire", "Part 2: Approvals over the wire"),
    p(
      "The Run is waiting rather than failed. Each ",
      code("ApprovalRequested"),
      " event carries an opaque ",
      code("event.request.approvalId"),
      "; a turn can produce several approval requests, so never construct or predict these tokens. ",
      link("/docs/learn/suspension", "Suspension as a typed error"),
      " explains the underlying typed suspension. This script builds ",
      code("Server.client"),
      ", takes the first approval request from the Session stream, and sends that exact token to ",
      code("client.approvals.resolve"),
      ", which calls ",
      code("POST /runs/:id/approvals/:token"),
      " with the human operator identity. Run it again for each later approval request:",
    ),
    codeBlock({ label: "approve.ts", source: approveSource, expectedOutput: approveOutput }),
    p(
      "The stream resumes, the tool executes, the second model turn synthesizes, and the run ends. The ",
      code("Completed"),
      " HostEvent carries the cited answer built from the search results. With ",
      code("OPENROUTER_API_KEY"),
      " set, the same frames carry a real model's answer instead.",
    ),
    h2("part-3-the-foldkit-ui", "Part 3: The FoldKit UI"),
    h3("scaffold-the-web-app", "Scaffold the web app"),
    codeBlock({ label: "Terminal", language: "bash", source: webSetupSource }),
    codeBlock({ label: "index.html", language: "html", source: webIndexSource }),
    h3("wire-the-chat", "Wire the chat"),
    p(
      code("generalist/unstable/foldkit"),
      " ships a headless chat submodel that decodes durable HostEvents and projects connection, turn, tool, approval, cancellation, and terminal state. The program embeds ",
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
      ". Those commands resolve the same durable approval token as Part 2. Host intentionally excludes internal model-response records from the product event stream, so this projection does not currently reconstruct incremental or committed assistant-response rows.",
    ),
    codeBlock({ label: "main.ts", source: webMainSource }),
    p("Run ", code("bunx vite"), " next to the ", code("index.html"), " and open the printed URL."),
    h2("success", "You have built the whole thing"),
    p(
      "Ask a question in the browser; the Agent pauses with an approval card; click Approve; watch the tool and Run reach their terminal states. Set ",
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
        "The chat model in depth (semantic entries, run state, reconnect states): ",
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
