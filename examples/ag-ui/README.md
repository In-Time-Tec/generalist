# AG-UI

This example serves a Generalist Host and a small AG-UI SSE route from one Bun server. Its plain-`fetch` client streams a run until the approval interrupt, posts the decision to the Host's approval route, and verifies that the run completes. Runtime state is retained in a real S3-compatible object store.

Configure a dedicated general-purpose S3 bucket and credentials that can read, conditionally create, and list objects:

```bash
export GENERALIST_BUCKET="your-generalist-bucket"
export AWS_REGION="us-east-1"
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export GENERALIST_ENVIRONMENT="development"
export GENERALIST_TENANT="example-team"
export GENERALIST_PARTITION="ag-ui"
```

For a custom S3-compatible endpoint, also set `GENERALIST_S3_ENDPOINT` and set `GENERALIST_S3_CAPABILITIES_CONFIRMED=true` only after independently verifying atomic conditional create, strong direct reads, and consistent listing. Temporary AWS credentials may additionally use `AWS_SESSION_TOKEN`.

```bash
bun run --cwd packages/generalist build
bun run --cwd examples/ag-ui start
```

The scripted model needs no model credential. The approval request uses the Host HTTP decision/operator contract. There is no SQL, simulator, or in-memory Runtime fallback.
