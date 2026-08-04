curl -s -X POST http://localhost:4000/runs \
  -H "content-type: application/json" \
  -d '{"runId":"research-run-1","sessionId":"research-1","idempotencyKey":"question-1","prompt":"What is Effect for TypeScript?"}'
