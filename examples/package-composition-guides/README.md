# Package composition guides

These nine programs show the smallest useful composition for Generalist core, providers, instructions, skills, memory, MCP, transport, FoldKit, and testing. The ordinary Agent/Session and feature-memory examples stay process-local. `src/transport.ts` is the durable example and uses the real S3-compatible object Runtime.

To run every program in sequence, configure a dedicated general-purpose S3 bucket and credentials that can read, conditionally create, and list objects:

```bash
export GENERALIST_BUCKET="your-generalist-bucket"
export AWS_REGION="us-east-1"
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export GENERALIST_ENVIRONMENT="development"
export GENERALIST_TENANT="example-team"
export GENERALIST_PARTITION="package-composition"
```

For a custom S3-compatible endpoint, also set `GENERALIST_S3_ENDPOINT` and set `GENERALIST_S3_CAPABILITIES_CONFIRMED=true` only after independently verifying atomic conditional create, strong direct reads, and consistent listing. Temporary AWS credentials may additionally use `AWS_SESSION_TOKEN`.

```bash
bun --cwd examples/package-composition-guides start
```

Each file under `src/` also runs independently with `bun`, for example:

```bash
bun examples/package-composition-guides/src/memory.ts
```

Running `src/transport.ts` independently still requires the S3 configuration above. No owned guide uses SQL or a Runtime memory fallback.
