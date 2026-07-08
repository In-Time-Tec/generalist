import * as Prose from "../../prose"

export const mcpReference = Prose.definePage({
  path: "/docs/reference/mcp",
  title: "@batonfx/mcp",
  navTitle: "mcp",
  group: "Reference",
  description: "McpToolSource for discovering and calling MCP tools, plus the Batonfx toolkit and executor adapters.",
  content: [
    Prose.lead(
      "@batonfx/mcp connects Model Context Protocol servers to Batonfx: McpToolSource discovers and calls MCP tools, and the baton subpath adapts them into a toolkit and a ToolExecutor.",
    ),
    Prose.command("Install", "bun add @batonfx/core @batonfx/mcp"),
    Prose.p(
      "Published on npm at 0.1.1. Requires ",
      Prose.code("@batonfx/core"),
      " and depends on ",
      Prose.code("@modelcontextprotocol/sdk"),
      ".",
    ),
    Prose.h2("exports", "Exports map"),
    Prose.table(
      ["Subpath", "Contents"],
      [
        [[Prose.code(".")], ["Namespace ", Prose.code("McpToolSource")]],
        [[Prose.code("./baton")], [Prose.code("toolkit(source)"), " and ", Prose.code("toolExecutorLayer(source)")]],
      ],
    ),
    Prose.h2("mcp-tool-source", "McpToolSource"),
    Prose.p(
      "The service interface: ",
      Prose.code("{ server, tools, callTool(rawName, input), aiTools }"),
      ". Discovered tool names are namespaced as ",
      Prose.code("<server>_<rawName>"),
      "; ",
      Prose.code("aiTools"),
      " renders each as a dynamic ",
      Prose.code("Ai.Tool"),
      " whose parameters are the server's JSON input schema.",
    ),
    Prose.table(
      ["Export", "Notes"],
      [
        [
          [Prose.code("McpTransport")],
          [
            Prose.code('{ kind: "stdio", command, args?, env? }'),
            " or ",
            Prose.code('{ kind: "http", url, headers? }'),
          ],
        ],
        [
          [Prose.code("layer({ name, transport, callTimeout? })")],
          ["Scoped layer that connects, lists tools once, and fails with ", Prose.code("McpConnectionError")],
        ],
        [
          [Prose.code("layerTagged(tag, options)")],
          "The same interface bound to a custom Context key, for multiple servers side by side",
        ],
        [
          [Prose.code("fromTransport(name, transport, options?)")],
          ["Scoped effect building an interface from a raw ", Prose.code("@modelcontextprotocol/sdk"), " transport"],
        ],
        [[Prose.code("CallOptions")], [Prose.code("{ callTimeout?: Duration.Input }"), " applied to every tool call"]],
        [
          [Prose.code("McpConnectionError"), " / ", Prose.code("McpToolCallError")],
          [Prose.code("{ server, message }"), " and ", Prose.code("{ server, tool, message }")],
        ],
      ],
    ),
    Prose.p(
      Prose.code("callTool"),
      " returns the server's structured content when present, otherwise the joined text content; ",
      Prose.code("isError"),
      " results fail with ",
      Prose.code("McpToolCallError"),
      ".",
    ),
    Prose.h2("baton-adapter", "The baton adapter"),
    Prose.table(
      ["Export", "Notes"],
      [
        [
          [Prose.code("toolkit(source)")],
          ["Discovered MCP tools as an ", Prose.code("Ai.Toolkit"), " for ", Prose.code("Agent.make")],
        ],
        [
          [Prose.code("toolExecutorLayer(source)")],
          [
            "A ",
            Prose.code("ToolExecutor"),
            " that proxies calls to the MCP server. Outcomes are ",
            Prose.code("Success"),
            " or ",
            Prose.code("Failure"),
            "; MCP tools never ",
            Prose.code("Suspend"),
          ],
        ],
      ],
    ),
    Prose.p(
      "Pair the two: the toolkit tells the model what exists, the executor routes the calls. See ",
      Prose.link("/docs/guides/mcp", "How to use MCP servers as tool sources"),
      ".",
    ),
  ],
})
