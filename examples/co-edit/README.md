# Co-edit

This example serves one browser editor and a Generalist Host from the same Bun server. The page joins `plan.md` over WebSocket as a human peer. A scripted `TestModel` agent reads the resulting version, edits it through `Artifact.tool`, and streams its attributed update back to the page.

The Runtime and `BlobStore` both use the same real S3-compatible object transport. There is no SQL, simulator, or in-memory durability fallback. Before running, provide a dedicated bucket and credentials that can read, conditionally create, and list objects:

```bash
export GENERALIST_BUCKET="your-generalist-bucket"
export AWS_REGION="us-east-1"
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export GENERALIST_ENVIRONMENT="development"
export GENERALIST_TENANT="example-team"
export GENERALIST_PARTITION="co-edit"
```

For a custom S3-compatible endpoint, also set `GENERALIST_S3_ENDPOINT` and set `GENERALIST_S3_CAPABILITIES_CONFIRMED=true` only after independently verifying atomic conditional create, strong direct reads, and consistent listing. Temporary AWS credentials may additionally use `AWS_SESSION_TOKEN`.

```bash
bun run --cwd packages/generalist build
bun run --cwd examples/co-edit start
```

The command opens an actual WebSocket, applies one human edit, runs the agent, verifies the converged document, and exits. No model credentials are required. To try the page interactively, keep the same server Layer running instead of disposing the example after its scripted check.
