# Structured Extraction

Turn invoice text into a value your application can use without parsing prose. This offline `Agent.run` example validates terminal model output with Effect `Schema` and prints `42 USD` from typed fields.

```bash
bun --cwd examples/structured-extraction start
```

The model response is scripted and needs no credentials. This checks schema-backed output wiring, not extraction accuracy on real invoices. Execution is process-local; no durable Runtime is involved.
