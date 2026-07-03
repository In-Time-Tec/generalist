# Multi-Agent

Baton multi-agent support is in-process and non-durable. `AgentTool.asTool` exposes a child agent as a handled tool. `Handoff.transferTool` and `Handoff.supervisor` build transfer-tool routing conventions. `Handoff.fanOut` runs child agents concurrently and preserves result order.

Durable, addressable child executions belong to Relay or another host runtime.

Runnable workflow: [`../../../examples/multi-agent/README.md`](../../../examples/multi-agent/README.md).
