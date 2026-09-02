# Cloudflare Worker

Run one request-scoped, process-local Generalist Agent through `generalist/unstable/cloudflare/workers`. The recipe uses a deterministic model, a schema-backed read-only tool, structured output, finite resource budgets, and a permission ruleset whose fallback is `deny`.

```bash
bun --cwd examples/cloudflare-worker typecheck
bun --cwd examples/cloudflare-worker dev
curl http://localhost:8787/
```

For production, replace `TestModel` with an exact provider registration such as `generalist/providers/openrouter`. Keep provider credentials in Worker bindings, construct the provider Layer inside the request scope, keep the permission fallback fail-closed, and let the application persist only its decoded command or proposal. A process-local Agent does not make Generalist Runtime or Durable Objects authoritative for application state.
