# The Loop and AgentEvent Stream

An `Agent` is a plain value: name, instructions, toolkit, model selection, and turn policy. `Agent.stream` is the primitive. `Agent.generate` collects the same stream into a terminal result.

A turn is one model call plus sequential execution of tool calls emitted by that model call. Baton feeds pending tool results back through `Ai.Prompt.fromResponseParts(...)` and repeats according to `TurnPolicy`. Pending tool results are never silently dropped; a stop policy with pending results fails the run.

`AgentEvent` is the closed stream of observable loop facts: turn start/completion, model parts, tool start/progress/completion, approval requests, structured output, and completion. Hosts can persist those events, render them, or translate them to transports without changing the core loop.

Normative contract: [`../../spec/01-baton-agent-framework.md`](../../spec/01-baton-agent-framework.md).
