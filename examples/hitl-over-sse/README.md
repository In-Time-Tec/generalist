# HITL over SSE

This example creates a Host Run whose approval request is retained by the real S3-compatible object Runtime, then encodes the resulting `HostEvent` with the wire contract used by `generalist/server`. The source demonstrates the event boundary; it does not start an HTTP listener.

Before running, provide a dedicated general-purpose S3 bucket and credentials that can read, conditionally create, and list objects:

```bash
export GENERALIST_BUCKET="your-generalist-bucket"
export AWS_REGION="us-east-1"
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export GENERALIST_ENVIRONMENT="development"
export GENERALIST_TENANT="example-team"
export GENERALIST_PARTITION="hitl-over-sse"
```

For a custom S3-compatible endpoint, also set `GENERALIST_S3_ENDPOINT` and set `GENERALIST_S3_CAPABILITIES_CONFIRMED=true` only after independently verifying atomic conditional create, strong direct reads, and consistent listing. Temporary AWS credentials may additionally use `AWS_SESSION_TOKEN`.

```bash
bun --cwd examples/hitl-over-sse start
```

The command prints the retained Host event tags and encoded wire size. There is no SQL, simulator, or in-memory durability fallback.
