# Tool-Calling Chatbot

Run a local offline agent that emits a tool call, executes it through a Baton `ToolExecutor`, and returns a final assistant answer.

```bash
bun --cwd examples/tool-calling-chatbot start
```

This example uses no live provider credentials. The model is a tiny scripted Effect AI `LanguageModel` layer.
