# Multi-agent

`AgentTool` exposes an in-process child Agent as an Effect AI tool. `Handoff` builds transfer tools and supervisors from the same path. Child requirements remain visible in handlers and parent composition.

Child runs do not inherit hidden parent identity or run options. At the tool boundary, child run failures and suspension become the child's declared domain failure. `fanOut` is not a tool boundary: it runs isolated children with an explicit bounded concurrency and preserves input order.

Durable or cross-process delegation belongs to a host runtime.
