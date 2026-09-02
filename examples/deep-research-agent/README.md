# Deep research agent

This full-stack example runs a durable in-memory research agent over HTTP, SSE, and WebSocket transport. The server uses a credential-free scripted model by default and switches to OpenRouter when `OPENROUTER_API_KEY` is set. The web app renders the streamed run with FoldKit.

Start the API server on port 4000:

```bash
bun --cwd examples/deep-research-agent start
```

In another terminal, start the web app:

```bash
bun --cwd examples/deep-research-agent web
```

No credentials are required for the scripted path. Set `OPENROUTER_API_KEY` before starting the server to use `openai/gpt-4o-mini` instead. The server keeps runs only in memory, so restarting it clears them.
