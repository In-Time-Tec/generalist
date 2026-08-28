curl -s -X POST localhost:4000/runs -H 'content-type: application/json' \
  -d '{"runId":"docs-run-1","sessionId":"docs-1","idempotencyKey":"message-1","prompt":"Research Effect fibers"}'
curl -N localhost:4000/runs/docs-run-1/events
