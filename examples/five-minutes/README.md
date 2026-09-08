# Five minutes

Keep accepted agent work recoverable when its Runtime closes. This example admits a Run into a real S3-compatible object Runtime, closes it, then reopens the same namespace and recovers the Run. The reopened scope explicitly activates durability and drains its external scheduler, showing the storage-backed recovery path rather than merely running the agent again.

Generalist's core agent loop does not require storage. This example adds the optional durable Runtime and uses a scripted model, so no model API key is needed.

Configure a dedicated general-purpose S3 bucket and credentials that can read, conditionally create, and list objects:

```bash
export GENERALIST_BUCKET="your-generalist-bucket"
export AWS_REGION="us-east-1"
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export GENERALIST_ENVIRONMENT="development"
export GENERALIST_TENANT="example-team"
export GENERALIST_PARTITION="five-minutes"
```

For a custom S3-compatible endpoint, also set `GENERALIST_S3_ENDPOINT` and set `GENERALIST_S3_CAPABILITIES_CONFIRMED=true` only after independently verifying atomic conditional create, strong direct reads, and consistent listing. Temporary AWS credentials may additionally use `AWS_SESSION_TOKEN`.

```bash
bun run --cwd packages/generalist build
bun run --cwd examples/five-minutes start
```

This example intentionally has no SQL, simulator, or Runtime memory fallback.
