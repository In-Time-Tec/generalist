TOKEN=replace-me
SESSION_ID=$(curl -s -X POST localhost:4000/sessions \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"id":"docs-1"}' | jq -r .id)
RUN_ID=$(curl -s -X POST "localhost:4000/sessions/$SESSION_ID/runs" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"agent":"research-agent","input":"Research Effect fibers","idempotencyKey":"message-1"}' | jq -r .id)
curl -N "localhost:4000/sessions/$SESSION_ID/events" -H "authorization: Bearer $TOKEN"
