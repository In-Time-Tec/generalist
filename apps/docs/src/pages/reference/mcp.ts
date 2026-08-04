import { code, command, definePage, h2, lead, link, p, table } from "../../prose"
export const mcpReference = definePage({
  path: "/docs/reference/mcp",
  title: "@batonfx/mcp",
  navTitle: "mcp",
  group: "Reference",
  description: "McpToolSource for discovering and calling MCP tools, plus the Batonfx toolkit and executor adapters.",
  content: [
    lead(
      "@batonfx/mcp connects Model Context Protocol servers to Batonfx: McpToolSource discovers and calls MCP tools, and the baton subpath adapts them into a toolkit and a ToolExecutor.",
    ),
    command("Install", "bun add @batonfx/core @batonfx/mcp"),
    p(
      "Published on npm at 0.14.0. Requires ",
      code("@batonfx/core"),
      " and depends on ",
      code("@modelcontextprotocol/sdk"),
      ".",
    ),
    h2("exports", "Exports map"),
    table(
      ["Subpath", "Contents"],
      [
        [[code(".")], ["Namespace ", code("McpToolSource")]],
        [
          [code("./baton")],
          [code("route(options)"), ", ", code("toolkit(source)"), " and ", code("layerToolkit(source)")],
        ],
      ],
    ),
    h2("mcp-tool-source", "McpToolSource"),
    p(
      "The service interface: ",
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
          [code("McpTransport")],
          [code('{ kind: "stdio", command, args?, env? }'), " or ", code('{ kind: "http", url, headers? }')],
        ],
        [
          [code("layer({ name, transport, callTimeout? })")],
          ["Scoped layer that connects, lists tools once, and fails with ", code("McpConnectionFailed")],
        ],
        [
          [code("layerTagged(tag, options)")],
          "The same interface bound to a custom Context key, for multiple servers side by side",
        ],
        [
          [code("fromTransport(name, transport, options?)")],
          ["Scoped effect building an interface from a raw ", code("@modelcontextprotocol/sdk"), " transport"],
        ],
        [[code("CallOptions")], [code("{ callTimeout?: Duration.Input }"), " applied to every tool call"]],
        [
          [code("McpConnectionFailed"), " / ", code("McpToolCallFailed")],
          [code("{ server, message }"), " and ", code("{ server, tool, message }")],
        ],
      ],
    ),
    p(
      code("callTool"),
      " returns the server's structured content when present, otherwise the joined text content; ",
      code("isError"),
      " results fail with ",
      code("McpToolCallFailed"),
      ".",
    ),
    h2("baton-adapter", "The baton adapter"),
    table(
      ["Export", "Notes"],
      [
        [
          [code("route({ name, transport, callTimeout? })")],
          [
            "Scoped acquisition returning ",
            code("BatonTools { toolkit, executorLayer }"),
            ". The executor layer installs both handlers and ",
            code("ToolExecutor"),
          ],
        ],
        [[code("toolkit(source)")], ["Discovered MCP tools as an ", code("Ai.Toolkit"), " for ", code("Agent.make")]],
        [
          [code("layerToolkit(source)")],
          [
            "Lower-level Effect AI handlers for an already acquired source. Structured MCP failures retain their tag, server, tool, and message fields",
          ],
        ],
      ],
    ),
    p(
      "Prefer route so the toolkit, handlers, executor, and connection lifetime cannot drift. Use the lower-level exports only when the host already owns the source. See ",
      link("/docs/guides/mcp", "How to use MCP servers as tool sources"),
      ".",
    ),
  ],
})
