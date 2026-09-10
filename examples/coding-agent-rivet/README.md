# Coding agent on Rivet

The default model and coding tools are scripted fixtures. They only accept `src/average.ts`; they do not read or edit the checkout. S3 is the durable authority, while one Rivet actor hosts the parent Run and both child Runs in one partition.

Both specialists call the `send_specialist_note` tool in `src/messaging.ts` before completing. The Runtime derives the sender from its execution context and admits each message under an explicit idempotency key. The recovery test also retries those exact messages through the host API and verifies that only two inbox entries remain. The actor's client actions do not expose arbitrary cross-Run messaging.

```bash
cp examples/coding-agent-rivet/.env.example examples/coding-agent-rivet/.env
docker compose --env-file examples/coding-agent-rivet/.env \
  -f examples/coding-agent-rivet/compose.yaml up -d minio
docker compose --env-file examples/coding-agent-rivet/.env \
  -f examples/coding-agent-rivet/compose.yaml run --rm create-bucket
bun --cwd examples/coding-agent-rivet demo
```

The demo prints the completed parent and both children, then keeps the actor host running. Press Ctrl-C to release its scope. Run it again with the same configuration to observe the same accepted Run. Local Rivet uses its existing `default` namespace; create other Rivet namespaces before configuring them. The MinIO bucket and Generalist partition remain separate from Rivet's engine storage.

Run the actor host without submitting the fixture task:

```bash
bun --cwd examples/coding-agent-rivet start
```

Run credential-free simulator checks:

```bash
bun --cwd examples/coding-agent-rivet test
bun --cwd examples/coding-agent-rivet typecheck
```

For hosted Rivet, set `RIVET_START_ENGINE=false`, `RIVET_ENDPOINT`, `RIVET_NAMESPACE`, `RIVET_POOL_NAME`, and, when required, `RIVET_TOKEN`. Configure the S3 variables for a pre-created general-purpose bucket. The local commands exercise MinIO and a managed local Rivet engine; they do not qualify live AWS S3 or a hosted Rivet deployment.
