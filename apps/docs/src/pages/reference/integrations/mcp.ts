import { code, command, definePage, h2, lead, link, p, table } from "../../../prose"
export const mcpReference = definePage({
  path: "/docs/reference/mcp",
  title: "tenetkit/mcp",
  navTitle: "mcp",
  group: "Reference",
  description: "MCPClient for discovering and calling MCP tools, plus the TenetKit toolkit and executor adapters.",
  content: [
    lead(
      "tenetkit/mcp connects Model Context Protocol servers to TenetKit: MCPClient discovers and calls MCP tools, and the tools subpath adapts them into a toolkit and a ToolExecutor.",
    ),
    command("Install", "bun add tenetkit tenetkit/mcp"),
    p(
      "Published on npm at 0.14.0. Requires ",
      code("tenetkit"),
      " and depends on ",
      code("@modelcontextprotocol/sdk"),
      ".",
    ),
    h2("exports", "Exports map"),
    table(
      ["Subpath", "Contents"],
      [
        [[code(".")], ["Namespace ", code("MCPClient")]],
        [
          [code("./tools")],
          [code("connect(options)"), ", ", code("toolkit(client)"), " and ", code("layerToolkit(client)")],
        ],
      ],
    ),
    h2("mcp-client", "MCPClient"),
    p(
      "The service shape: ",
      code("{ server, tools, callTool(rawName, input), aiTools }"),
      ". Discovered tool names are namespaced as ",
      code("<server>_<rawName>"),
      "; ",
      code("aiTools"),
      " renders each as a dynamic ",
      code("Ai.Tool"),
      " whose parameters are the server's JSON input schema.",
    ),
    table(
      ["Export", "Notes"],
      [
        [
          [code("MCPTransport")],
          [code('{ kind: "stdio", command, args?, env? }'), " or ", code('{ kind: "http", url, headers? }')],
        ],
        [
          [code("layer({ name, transport, callTimeout? })")],
          ["Scoped layer that connects, lists tools once, and fails with ", code("MCPConnectionFailed")],
        ],
        [
          [code("layerTagged(tag, options)")],
          "The same service bound to a custom Context key, for multiple servers side by side",
        ],
        [
          [code("fromTransport(name, transport, options?)")],
          ["Scoped effect building a client from a raw ", code("@modelcontextprotocol/sdk"), " transport"],
        ],
        [[code("CallOptions")], [code("{ callTimeout?: Duration.Input }"), " applied to every tool call"]],
        [
          [code("MCPConnectionFailed"), " / ", code("MCPToolCallFailed")],
          [code("{ server, message }"), " and ", code("{ server, tool, message }")],
        ],
      ],
    ),
    p(
      code("callTool"),
      " returns the server's structured content when present, otherwise the joined text content; ",
      code("isError"),
      " results fail with ",
      code("MCPToolCallFailed"),
      ".",
    ),
    h2("tools-adapter", "The tools adapter"),
    table(
      ["Export", "Notes"],
      [
        [
          [code("connect({ name, transport, callTimeout? })")],
          [
            "Scoped acquisition returning ",
            code("MCPTools { toolkit, executorLayer }"),
            ". The executor layer installs both handlers and ",
            code("ToolExecutor"),
          ],
        ],
        [[code("toolkit(client)")], ["Discovered MCP tools as an ", code("Ai.Toolkit"), " for ", code("Agent.make")]],
        [
          [code("layerToolkit(client)")],
          [
            "Lower-level Effect AI handlers for an already acquired client. Structured MCP failures retain their tag, server, tool, and message fields",
          ],
        ],
      ],
    ),
    p(
      "Prefer connect so the toolkit, handlers, executor, and connection lifetime cannot drift. Use the lower-level exports only when the host already owns the client. See ",
      link("/docs/guides/mcp", "How to connect MCP servers"),
      ".",
    ),
  ],
})
