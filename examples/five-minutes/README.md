# Five minutes

Keep accepted agent work recoverable when its Runtime closes. This example holds a typed Run in an S3-compatible object store, closes the Runtime, then reopens the same namespace and retrieves the same Run through its original idempotency key. The reopened scope activates the held handle and awaits its output; `Runtime.layer` owns registration, activation, and scheduling, so the application never handles a claim or drains an executor.

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
