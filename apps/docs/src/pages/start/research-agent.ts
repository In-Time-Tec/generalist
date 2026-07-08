import setupSource from "../../snippets/research-agent/setup.sh?raw"
import searchProviderSource from "../../snippets/research-agent/search-provider.ts?raw"
import toolsSource from "../../snippets/research-agent/tools.ts?raw"
import modelSource from "../../snippets/research-agent/model.ts?raw"
import agentSource from "../../snippets/research-agent/agent.ts?raw"
import serverSource from "../../snippets/research-agent/server.ts?raw"
import mainSource from "../../snippets/research-agent/main.txt?raw"
import openSessionSource from "../../snippets/research-agent/open-session.sh?raw"
import openSessionOutput from "../../snippets/research-agent/open-session-output.txt?raw"
import sendMessageSource from "../../snippets/research-agent/send-message.sh?raw"
import sendMessageOutput from "../../snippets/research-agent/send-message-output.txt?raw"
import eventsSource from "../../snippets/research-agent/events.sh?raw"
import eventsOutput from "../../snippets/research-agent/events-output.txt?raw"
import approveSource from "../../snippets/research-agent/approve.ts?raw"
import approveOutput from "../../snippets/research-agent/approve-output.txt?raw"
import webSetupSource from "../../snippets/research-agent/web-setup.sh?raw"
import webIndexSource from "../../snippets/research-agent/web-index.html?raw"
import webMainSource from "../../snippets/research-agent/web-main.ts?raw"
import * as Prose from "../../prose"

export const researchAgent = Prose.definePage({
  path: "/docs/start/research-agent",
  title: "Tutorial: a research agent with approvals and a live UI",
  navTitle: "Tutorial: research agent",
  group: "Start",
  description:
    "Build a research agent with a real web_search tool, human approval over the wire, and a streaming FoldKit chat UI: zero-credential by default, live with one env var.",
  content: [
    Prose.lead(
      "In this tutorial we build a research agent with a real web_search tool, human approval, and a streaming FoldKit chat UI. It runs with zero credentials by default and goes live against a real model with one environment variable.",
    ),
    Prose.p(
      "Three parts: a Bun server that streams agent runs over SSE and WebSocket, an approval resolved over the wire, and a browser chat UI. If you have not done ",
      Prose.link("/docs/start/quickstart", "the quickstart"),
      ", start there. The finished, styled version of this app lives in the repository at ",
      Prose.link(
        "https://github.com/In-Time-Tec/batonfx/tree/main/examples/deep-research-agent",
        "examples/deep-research-agent",
      ),
      ".",
    ),
    Prose.h2("part-1-the-server", "Part 1: The server"),
    Prose.h3("scaffold-the-server", "Scaffold the server"),
    Prose.codeBlock({ label: "Terminal", language: "bash", source: setupSource }),
    Prose.h3("a-search-provider-service", "A search provider service"),
    Prose.p(
      "Tools should not talk to the outside world directly; they resolve services you own. Ours answers every query with canned results so the tutorial runs offline; swapping in a real search API later means swapping this one layer.",
    ),
    Prose.codeBlock({ label: "search-provider.ts", source: searchProviderSource }),
    Prose.h3("the-web-search-tool", "The web_search tool"),
    Prose.p(
      Prose.code("Ai.Tool.make"),
      " declares the name, parameter schema, and success schema; ",
      Prose.code("dependencies"),
      " names the service the handler resolves; ",
      Prose.code('failureMode: "return"'),
      " feeds tool failures back to the model as results. The one line that changes everything downstream is ",
      Prose.code("needsApproval: true"),
      ". This tool will not run without a human decision.",
    ),
    Prose.codeBlock({ label: "tools.ts", source: toolsSource }),
    Prose.h3("a-model-with-a-deterministic-fallback", "A model with a deterministic fallback"),
    Prose.p(
      "When ",
      Prose.code("OPENROUTER_API_KEY"),
      " resolves, the layer is a real OpenRouter model. When it does not, a scripted model stands in: it reads the growing prompt, where no prior ",
      Prose.code("web_search"),
      " result means emit a tool call; a prior result means synthesize a cited answer from it.",
    ),
    Prose.codeBlock({ label: "model.ts", source: modelSource }),
    Prose.h3("the-agent", "The agent"),
    Prose.codeBlock({ label: "agent.ts", source: agentSource }),
    Prose.h3("sessions-and-routes", "Sessions and routes"),
    Prose.p(
      Prose.code("SessionRegistry.layerMemory"),
      " runs agent sessions in memory and publishes every run as replayable wire frames. It needs the four run layers plus chat persistence. The approvals layer returns ",
      Prose.code("Pending"),
      " with a token, so approval-gated tools park the run until a human resolves it. The routes serve the registry over HTTP: ",
      Prose.code("GET /ws"),
      " for WebSocket, ",
      Prose.code("GET /sessions/:id/events"),
      " for SSE, and POST routes to open sessions and send messages.",
    ),
    Prose.codeBlock({ label: "server.ts", source: serverSource }),
    Prose.h3("serve-it-with-bun", "Serve it with Bun"),
    Prose.p(
      "The entrypoint provides the platform HTTP server from ",
      Prose.code("@effect/platform-bun"),
      " and launches the layer. Start it with ",
      Prose.code("bun run index.ts"),
      ":",
    ),
    Prose.codeBlock({ label: "index.ts", source: mainSource }),
    Prose.h3("watch-a-run-suspend", "Watch a run suspend"),
    Prose.p("With the server running, open a session:"),
    Prose.codeBlock({
      label: "Terminal",
      language: "bash",
      source: openSessionSource,
      expectedOutput: openSessionOutput,
    }),
    Prose.p("Send a question:"),
    Prose.codeBlock({
      label: "Terminal",
      language: "bash",
      source: sendMessageSource,
      expectedOutput: sendMessageOutput,
    }),
    Prose.p("Then tail the SSE stream:"),
    Prose.codeBlock({ label: "Terminal", language: "bash", source: eventsSource, expectedOutput: eventsOutput }),
    Prose.p(
      "Read the frames in order: the model planned a ",
      Prose.code("tool-call"),
      ", ",
      Prose.code("ApprovalRequested"),
      " was emitted, and then the run parked. The ",
      Prose.code("Suspended"),
      " frame carries a token and the exact shape of the pending call. Every frame has a monotonic ",
      Prose.code("seq"),
      ", which is the replay cursor a reconnecting client resumes from.",
    ),
    Prose.h2("part-2-approvals-over-the-wire", "Part 2: Approvals over the wire"),
    Prose.p(
      "The run is not failed and not running. It is suspended, a typed state carrying ",
      Prose.code('token: "approve-search-1"'),
      ". ",
      Prose.link("/docs/learn/suspension", "Suspension as a typed error"),
      " explains why the field shape mirrors a tool call. To resume, a client sends a ",
      Prose.code("ResolveApproval"),
      " frame over the WebSocket with that token. This script connects with the transport client, approves, and prints every frame after the suspension:",
    ),
    Prose.codeBlock({ label: "approve.ts", source: approveSource, expectedOutput: approveOutput }),
    Prose.p(
      "The stream resumes, the tool executes, the second model turn synthesizes, and the run ends. The ",
      Prose.code("Completed"),
      " event carries the cited answer built from the search results. With ",
      Prose.code("OPENROUTER_API_KEY"),
      " set, the same frames carry a real model's answer instead.",
    ),
    Prose.h2("part-3-the-foldkit-ui", "Part 3: The FoldKit UI"),
    Prose.h3("scaffold-the-web-app", "Scaffold the web app"),
    Prose.codeBlock({ label: "Terminal", language: "bash", source: webSetupSource }),
    Prose.codeBlock({ label: "index.html", language: "html", source: webIndexSource }),
    Prose.h3("wire-the-chat", "Wire the chat"),
    Prose.p(
      Prose.code("@batonfx/foldkit"),
      " ships a headless chat submodel that does the frame decoding, streaming assembly, and approval state for you. The program embeds ",
      Prose.code("Chat.Model"),
      " in its own model, forwards ",
      Prose.code("Chat.subscriptions"),
      " with ",
      Prose.code("Subscription.lift"),
      ", routes every child message through a ",
      Prose.code("GotChatMessage"),
      " wrapper, and provides the connection as a layer: ",
      Prose.code("Connection.layerWebSocket"),
      ". When ",
      Prose.code("model.chat.run"),
      " is ",
      Prose.code("AwaitingApproval"),
      ", the view renders Approve and Deny buttons dispatching ",
      Prose.code("Chat.ClickedApprove"),
      " and ",
      Prose.code("Chat.ClickedDeny"),
      ". That is the same wire frame Part 2 sent by hand.",
    ),
    Prose.codeBlock({ label: "main.ts", source: webMainSource }),
    Prose.p("Run ", Prose.code("bunx vite"), " next to the ", Prose.code("index.html"), " and open the printed URL."),
    Prose.h2("success", "You have built the whole thing"),
    Prose.p(
      "Ask a question in the browser; the agent pauses with an approval card; click Approve; watch the answer stream in live. Set ",
      Prose.code("OPENROUTER_API_KEY"),
      " and restart the server to run the same flow against a real model.",
    ),
    Prose.h2("next-steps", "Next steps"),
    Prose.bullets(
      [
        "The transport in depth (replay cursors, snapshots, busy sessions): ",
        Prose.link("/docs/guides/serve-transport", "How to serve an agent over SSE and WebSocket"),
        ".",
      ],
      [
        "The chat model in depth (entries, streaming, reconnect states): ",
        Prose.link("/docs/guides/foldkit-chat", "How to build a chat UI with FoldKit"),
        ".",
      ],
      [
        "Where durability lives when runs must survive restarts: ",
        Prose.link("/docs/learn/baton-and-relay", "Baton and Relay"),
        ".",
      ],
    ),
  ],
})
