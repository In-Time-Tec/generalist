import connectServer from "virtual:source/src/snippets/guides/tools/mcp/connect-server.ts"
import scriptedSource from "virtual:source/src/snippets/guides/tools/mcp/scripted-source.ts"
import scriptedSourceExpected from "virtual:source/src/snippets/guides/tools/mcp/scripted-source.expected.txt"
import { bullets, code, codeBlock, command, definePage, h2, link, p, table } from "../../../prose"
export const mcp = definePage({
  path: "/docs/guides/mcp",
  title: "How to use MCP servers as tool sources",
  navTitle: "Use MCP tool sources",
  group: "Guides",
  description:
    "Connect to an MCP server with McpToolSource, expose its discovered tools as a TenetKit toolkit, and proxy tool calls through the MCP executor.",
  content: [
    p(
      code("tenetkit/mcp"),
      " connects to an MCP server, discovers its tools, and exposes one scoped ",
      code("route"),
      " containing the toolkit the model sees and the executor layer that proxies calls to the same connection. The bridge keeps MCP SDK dependencies out of ",
      code("tenetkit"),
      ".",
    ),
    command("Terminal", "bun add tenetkit/mcp"),
    h2("connect-to-a-server", "1. Connect to a server"),
    p(
      code("McpToolSource.layer"),
      " remains the lower-level source API. The usual ",
      code("route"),
      " API opens the connection, lists the tools once, and closes the client when its Effect scope ends. Discovered tool names are prefixed with the source name: a ",
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
        [[code('{ kind: "stdio" }')], [code("command"), ", optional ", code("args"), " and ", code("env")]],
        [[code('{ kind: "http" }')], [code("url"), ", optional ", code("headers")]],
      ],
    ),
    p(
      "Hosts that run several servers side by side register each under its own tag with ",
      code("McpToolSource.layerTagged"),
      ".",
    ),
    h2("how-calls-behave", "2. How calls behave"),
    bullets(
      [
        "MCP tool failures become TenetKit tool ",
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
        " to the SDK, so interrupting a TenetKit run cancels the in-flight MCP request on the server.",
      ],
      [
        "An optional ",
        code("callTimeout"),
        " bounds each call; on expiry the call fails with ",
        code("McpToolCallFailed"),
        " and the loop continues.",
      ],
    ),
    h2("test-without-a-live-server", "3. Test without a live server"),
    p(
      code("McpToolSource.Interface"),
      " is plain data plus effects, so tests hand the adapter an in-memory source instead of a connection. This is the ",
      link("https://github.com/In-Time-Tec/tenetkit/tree/main/examples/mcp-agent", "examples/mcp-agent"),
      " program, runnable with zero credentials.",
    ),
    codeBlock({ label: "scripted-source.ts", source: scriptedSource, expectedOutput: scriptedSourceExpected }),
    p(
      "Local tools and MCP tools use the same executor seam, so start with ",
      link("/docs/guides/define-tools", "How to define tools and toolkits"),
      " if you have not built a toolkit before. The full interface is in ",
      link("/docs/reference/mcp", "the tenetkit/mcp reference"),
      ".",
    ),
  ],
})
