# A2A

This example runs two Generalist hosts in one process. Agent A calls its delegation tool, the tool sends an A2A v1 message through Generalist's SDK handler, and Agent B's Run returns the artifact that Agent A uses in its answer. The Runtime state is retained in a real S3-compatible object store.

Configure a dedicated general-purpose S3 bucket and credentials that can read, conditionally create, and list objects:

```bash
export GENERALIST_BUCKET="your-generalist-bucket"
export AWS_REGION="us-east-1"
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export GENERALIST_ENVIRONMENT="development"
export GENERALIST_TENANT="example-team"
export GENERALIST_PARTITION="a2a"
```

For a custom S3-compatible endpoint, also set `GENERALIST_S3_ENDPOINT` and set `GENERALIST_S3_CAPABILITIES_CONFIRMED=true` only after independently verifying atomic conditional create, strong direct reads, and consistent listing. Temporary AWS credentials may additionally use `AWS_SESSION_TOKEN`.

```bash
bun run --cwd packages/generalist build
bun run --cwd examples/a2a start
```

The example calls the transport-neutral A2A handler directly; a deployment mounts the same handler in an A2A SDK transport. The scripted models need no model credential. There is no SQL, simulator, or in-memory Runtime fallback.
