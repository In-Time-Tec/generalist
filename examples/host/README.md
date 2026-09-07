# Host

This tiny deterministic CLI builds a product-facing Host over the real S3-compatible object Runtime. It creates a Session, starts a typed Agent, runs a plugin tool, replays the Session event stream, and prints the result. The scripted model needs no model API key, but the object store is required.

Configure a dedicated general-purpose S3 bucket and credentials that can read, conditionally create, and list objects:

```bash
export GENERALIST_BUCKET="your-generalist-bucket"
export AWS_REGION="us-east-1"
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export GENERALIST_ENVIRONMENT="development"
export GENERALIST_TENANT="example-team"
export GENERALIST_PARTITION="host"
```

For a custom S3-compatible endpoint, also set `GENERALIST_S3_ENDPOINT` and set `GENERALIST_S3_CAPABILITIES_CONFIRMED=true` only after independently verifying atomic conditional create, strong direct reads, and consistent listing. Temporary AWS credentials may additionally use `AWS_SESSION_TOKEN`.

```bash
bun run --cwd examples/host start
```

There is no SQL, simulator, or in-memory Runtime fallback.
