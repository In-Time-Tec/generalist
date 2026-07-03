# Tools and Toolkits

Define tools with `effect/unstable/ai` and attach them to an agent toolkit. Baton separates advertisement from execution: the model sees the toolkit, and `ToolExecutor` decides how the call runs.

Use `ToolExecutor.fromToolkit` when a handled toolkit should run locally. Use `ToolExecutor.testLayer` in tests and examples. Durable hosts replace the executor with their own tool runtime while preserving Baton's `Success | Failure | Suspend` outcome shape.

Tool output spill is optional. When `RunOptions.toolOutputMaxBytes` is set and a `ToolOutputStore` is present, large successful results are bounded into an inline envelope and full output paths are carried out of context.

Runnable workflow: [`../../../examples/tool-calling-chatbot/README.md`](../../../examples/tool-calling-chatbot/README.md).
