import connectServer from "../../snippets/guides/mcp/connect-server.ts?raw"
import scriptedSource from "../../snippets/guides/mcp/scripted-source.ts?raw"
import scriptedSourceExpected from "../../snippets/guides/mcp/scripted-source.expected.txt?raw"
import * as Prose from "../../prose"

export const mcp = Prose.definePage({
  path: "/docs/guides/mcp",
  title: "How to use MCP servers as tool sources",
  navTitle: "Use MCP tool sources",
  group: "Guides",
  description:
    "Connect to an MCP server with McpToolSource, expose its discovered tools as a Baton toolkit, and proxy tool calls through the MCP executor.",
  content: [
    Prose.p(
      Prose.code("@batonfx/mcp"),
      " connects to an MCP server, discovers its tools, and exposes them in two pieces: ",
      Prose.code("BatonMcp.toolkit(source)"),
      " builds the toolkit the model sees, and ",
      Prose.code("BatonMcp.toolExecutorLayer(source)"),
      " proxies tool calls to the server instead of local handlers. The bridge keeps MCP SDK dependencies out of ",
      Prose.code("@batonfx/core"),
      ".",
    ),
    Prose.command("Terminal", "bun add @batonfx/mcp"),
    Prose.h2("connect-to-a-server", "1. Connect to a server"),
    Prose.p(
      Prose.code("McpToolSource.layer"),
      " opens the connection, lists the tools once, and closes the client when the layer's scope ends. Discovered tool names are prefixed with the source name: a ",
      Prose.code("search"),
      " tool on the ",
      Prose.code("files"),
      " server becomes ",
      Prose.code("files_search"),
      ".",
    ),
    Prose.codeBlock({ label: "connect-server.ts", source: connectServer }),
    Prose.table(
      ["Transport", "Fields"],
      [
        [
          [Prose.code('{ kind: "stdio" }')],
          [Prose.code("command"), ", optional ", Prose.code("args"), " and ", Prose.code("env")],
        ],
        [[Prose.code('{ kind: "http" }')], [Prose.code("url"), ", optional ", Prose.code("headers")]],
      ],
    ),
    Prose.p(
      "Hosts that run several servers side by side register each under its own tag with ",
      Prose.code("McpToolSource.layerTagged"),
      ".",
    ),
    Prose.h2("how-calls-behave", "2. How calls behave"),
    Prose.bullets(
      [
        "MCP tool failures become Baton tool ",
        Prose.code("Failure"),
        " outcomes, so the model sees a failed tool result and can react. MCP tools never ",
        Prose.code("Suspend"),
        ".",
      ],
      [
        "Every ",
        Prose.code("tools/call"),
        " passes the running fiber's ",
        Prose.code("AbortSignal"),
        " to the SDK, so interrupting a Baton run cancels the in-flight MCP request on the server.",
      ],
      [
        "An optional ",
        Prose.code("callTimeout"),
        " bounds each call; on expiry the call fails with ",
        Prose.code("McpToolCallError"),
        " and the loop continues.",
      ],
    ),
    Prose.h2("test-without-a-live-server", "3. Test without a live server"),
    Prose.p(
      Prose.code("McpToolSource.Interface"),
      " is plain data plus effects, so tests hand the adapter an in-memory source instead of a connection. This is the ",
      Prose.link("https://github.com/In-Time-Tec/batonfx/tree/main/examples/mcp-agent", "examples/mcp-agent"),
      " program, runnable with zero credentials.",
    ),
    Prose.codeBlock({ label: "scripted-source.ts", source: scriptedSource, expectedOutput: scriptedSourceExpected }),
    Prose.p(
      "Local tools and MCP tools use the same executor seam, so start with ",
      Prose.link("/docs/guides/define-tools", "How to define tools and toolkits"),
      " if you have not built a toolkit before. The full interface is in ",
      Prose.link("/docs/reference/mcp", "the @batonfx/mcp reference"),
      ".",
    ),
  ],
})
