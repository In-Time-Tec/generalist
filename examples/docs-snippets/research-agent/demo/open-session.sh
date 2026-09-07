export SESSION_ID=research-1
TOKEN=${GENERALIST_SERVER_TOKEN:?set GENERALIST_SERVER_TOKEN}
curl -fsS -X POST http://localhost:4000/sessions \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d "{\"id\":\"$SESSION_ID\"}" >/dev/null
export RUN_ID=$(curl -fsS -X POST "http://localhost:4000/sessions/$SESSION_ID/runs" \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"agent":"research-agent","input":"What is Effect for TypeScript?","idempotencyKey":"question-1"}' | jq -r .id)
printf '{"sessionId":"%s","runId":"%s"}\n' "$SESSION_ID" "$RUN_ID"
