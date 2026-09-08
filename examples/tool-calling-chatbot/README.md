# Tool-Calling Chatbot

Give an agent a tool instead of asking it to invent the result. This local example emits a tool call, executes it through a Generalist `ToolExecutor`, and returns a final assistant answer, showing where application code joins the model loop.

```bash
bun --cwd examples/tool-calling-chatbot start
```

This example uses no live provider credentials. The model is a tiny scripted Effect AI `LanguageModel` layer, so the run demonstrates tool dispatch rather than a model's ability to choose the right tool. Execution is process-local; no durable Runtime is involved.
