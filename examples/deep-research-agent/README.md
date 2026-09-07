# Deep research agent

This full-stack example runs a research agent over HTTP, SSE, and WebSocket transport. Accepted Runs and approval state use the real S3-compatible object Runtime; the web app renders the streamed run with FoldKit. The server uses a credential-free scripted model by default and switches to OpenRouter when `OPENROUTER_API_KEY` is set.

Before starting the server, provide a dedicated general-purpose S3 bucket and credentials that can read, conditionally create, and list objects:

```bash
export GENERALIST_BUCKET="your-generalist-bucket"
export AWS_REGION="us-east-1"
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export GENERALIST_ENVIRONMENT="development"
export GENERALIST_TENANT="example-team"
export GENERALIST_PARTITION="deep-research"
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

No model credentials are required for the scripted path. Set `OPENROUTER_API_KEY` before starting the server to use `openai/gpt-4o-mini`. Storage remains real object I/O in either model mode; missing or invalid storage configuration fails startup rather than selecting a memory fallback.
