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
      "Published on npm at 0.3.0. Requires ",
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
        [[code("./baton")], [code("toolkit(source)"), " and ", code("toolExecutorLayer(source)")]],
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
          ["Scoped layer that connects, lists tools once, and fails with ", code("McpConnectionError")],
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
          [code("McpConnectionError"), " / ", code("McpToolCallError")],
          [code("{ server, message }"), " and ", code("{ server, tool, message }")],
        ],
      ],
    ),
    p(
      code("callTool"),
      " returns the server's structured content when present, otherwise the joined text content; ",
      code("isError"),
      " results fail with ",
      code("McpToolCallError"),
      ".",
    ),
    h2("baton-adapter", "The baton adapter"),
    table(
      ["Export", "Notes"],
      [
        [[code("toolkit(source)")], ["Discovered MCP tools as an ", code("Ai.Toolkit"), " for ", code("Agent.make")]],
        [
          [code("toolExecutorLayer(source)")],
          [
            "A ",
            code("ToolExecutor"),
            " that proxies calls to the MCP server. Outcomes are ",
            code("Success"),
            " or ",
            code("Failure"),
            "; MCP tools never ",
            code("Suspend"),
          ],
        ],
      ],
    ),
    p(
      "Pair the two: the toolkit tells the model what exists, the executor routes the calls. See ",
      link("/docs/guides/mcp", "How to use MCP servers as tool sources"),
      ".",
    ),
  ],
})
