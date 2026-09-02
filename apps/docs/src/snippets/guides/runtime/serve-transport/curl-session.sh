RUN_ID=$(curl -s -X POST localhost:4000/runs -H 'content-type: application/json' \
  -d '{"sessionId":"docs-1","idempotencyKey":"message-1","prompt":"Research Effect fibers"}' | jq -r .runId)
curl -N "localhost:4000/runs/$RUN_ID/events"
