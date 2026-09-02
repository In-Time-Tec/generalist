export RUN_ID=$(curl -s -X POST http://localhost:4000/runs \
  -H "content-type: application/json" \
  -d '{"sessionId":"research-1","idempotencyKey":"question-1","prompt":"What is Effect for TypeScript?"}' | jq -r .runId)
printf '{"runId":"%s"}\n' "$RUN_ID"
