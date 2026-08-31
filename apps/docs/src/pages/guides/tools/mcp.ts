import connectServer from "virtual:source/src/snippets/guides/tools/mcp/connect-server.ts"
import scriptedClient from "virtual:source/src/snippets/guides/tools/mcp/scripted-client.ts"
import scriptedClientExpected from "virtual:source/src/snippets/guides/tools/mcp/scripted-client.expected.txt"
import { bullets, code, codeBlock, command, definePage, h2, link, p, table } from "../../../prose"
export const mcp = definePage({
  path: "/docs/guides/mcp",
  title: "How to connect MCP servers",
  navTitle: "Connect MCP servers",
  group: "Guides",
  description:
    "Connect to an MCP server with MCPClient, expose its discovered tools as a Generalist toolkit, and proxy tool calls through the MCP executor.",
  content: [
    p(
      code("generalist/mcp"),
      " connects to an MCP server, discovers its tools, and exposes one scoped ",
      code("connect"),
      " containing the toolkit the model sees and the executor layer that proxies calls to the same connection. The bridge keeps MCP SDK dependencies out of ",
      code("generalist"),
      ".",
    ),
    command("Terminal", "bun add effect@4.0.0-rc.112 generalist@0.44.0 @modelcontextprotocol/sdk@1.29.0"),
    h2("connect-to-a-server", "1. Connect to a server"),
    p(
      code("MCPClient.layer"),
      " remains the lower-level client API for a raw MCP SDK transport. Construct Streamable HTTP transports with ",
      code("generalist/mcp/client/http"),
      " in browsers and Workers, or opt into the Node/Bun-only ",
      code("generalist/mcp/client/stdio"),
      ". The usual ",
      code("connect"),
      " API opens the connection, lists the tools once, and closes the client when its Effect scope ends. Discovered tool names are prefixed with the client name: a ",
      code("search"),
      " tool on the ",
      code("files"),
      " server becomes ",
      code("files_search"),
      ".",
    ),
    codeBlock({ label: "connect-server.ts", source: connectServer }),
    table(
      ["Transport", "Fields"],
      [
        [[code("generalist/mcp/client/http")], [code("make({ url, requestInit?, oauth? })"), "; Worker-safe"]],
        [[code("generalist/mcp/client/stdio")], [code("make({ command, args?, env? })"), "; Node/Bun only"]],
      ],
    ),
    p(
      "Construct bearer headers in HTTP ",
      code("requestInit"),
      " only after resolving the host's secret reference; do not persist the raw credential in executable registration data. ",
      "Hosts that run several servers side by side register each under its own tag with ",
      code("MCPClient.layerTagged"),
      ".",
    ),
    h2("how-calls-behave", "2. How calls behave"),
    bullets(
      [
        "MCP tool failures become Generalist tool ",
        code("Failure"),
        " outcomes, so the model sees a failed tool result and can react. MCP tools never ",
        code("Suspend"),
        ".",
      ],
      [
        "Every ",
        code("tools/call"),
        " passes the running fiber's ",
        code("AbortSignal"),
        " to the SDK, so interrupting a Generalist run cancels the in-flight MCP request on the server.",
      ],
      [
        "An optional ",
        code("callTimeout"),
        " bounds each call; on expiry the call fails with ",
        code("MCPToolCallFailed"),
        " and the loop continues.",
      ],
    ),
    h2("test-without-a-live-server", "3. Test without a live server"),
    p(
      code("MCPClient.Service"),
      " is plain data plus effects, so tests hand the adapter an in-memory client instead of a connection. This is the ",
      link("https://github.com/In-Time-Tec/generalist/tree/main/examples/mcp-agent", "examples/mcp-agent"),
      " program, runnable with zero credentials.",
    ),
    codeBlock({ label: "scripted-client.ts", source: scriptedClient, expectedOutput: scriptedClientExpected }),
    p(
      "Local tools and MCP tools use the same executor seam, so start with ",
      link("/docs/guides/define-tools", "How to define tools and toolkits"),
      " if you have not built a toolkit before. The full interface is in ",
      link("/docs/reference/mcp", "the generalist/mcp reference"),
      ".",
    ),
  ],
})
