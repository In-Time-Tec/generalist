# Deep research agent

Let a user inspect an agent's sources and approve a search before it runs. This browser demo shows the question, search call, results, and cited answer in one conversation, so the user can follow the work rather than wait for an unexplained final response.

The default model is scripted and search results are canned. This demonstrates the interaction and transport, not autonomous research or source accuracy. Generalist's core agent loop is process-local; this app adds the optional S3-compatible durable Runtime for accepted Runs and approval state. In-flight previews are memory-only and fenced to the active stream; reconnect restores committed conversation state, not lost preview tokens.

## Run locally

Before starting the server, provide a dedicated general-purpose S3 bucket and credentials that can read, conditionally create, and list objects:

```bash
export GENERALIST_BUCKET="your-generalist-bucket"
export AWS_REGION="us-east-1"
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export GENERALIST_ENVIRONMENT="development"
export GENERALIST_TENANT="example-team"
export GENERALIST_PARTITION="deep-research"
export GENERALIST_SERVER_TOKEN="replace-with-a-private-local-token"
```

For a custom S3-compatible endpoint, also set `GENERALIST_S3_ENDPOINT` and set `GENERALIST_S3_CAPABILITIES_CONFIRMED=true` only after independently verifying atomic conditional create, strong direct reads, and consistent listing. Temporary AWS credentials may additionally use `AWS_SESSION_TOKEN`.

Start the API server on port 4000:

```bash
bun --cwd examples/deep-research-agent start
```

In another terminal, start the web app:

```bash
bun --cwd examples/deep-research-agent web
```

## Try it

Open `http://localhost:5173`, enter your `GENERALIST_SERVER_TOKEN` in the login form, and select **Connect**. The server exchanges it for a short-lived, HTTP-only session cookie. If authentication fails, check that the token matches the server and that you opened the page on localhost. Keep the token private. This example gives the authenticated user controller access to the configured tenant; it is not a multi-user authorization policy.

Ask “What is Effect for TypeScript?” Inspect the `web_search` arguments, approve the search, and compare its results with the cited answer. Reconnect to see the committed state restored; unfinished preview text is not a saved answer.

No model credentials are required for the scripted path. Set `OPENROUTER_API_KEY` before starting the server to use `openai/gpt-4o-mini`; search remains canned unless `EXA_API_KEY` is also set. Live providers can incur costs. Storage remains real object I/O in either model mode; missing or invalid storage configuration fails startup rather than selecting a memory fallback.
