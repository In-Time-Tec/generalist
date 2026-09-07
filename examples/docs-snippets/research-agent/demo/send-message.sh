curl -s -X POST http://localhost:4000/sessions/research-1/messages \
  -H "authorization: Bearer ${GENERALIST_SERVER_TOKEN:?set GENERALIST_SERVER_TOKEN}" \
  -H "content-type: application/json" \
  -d '{"prompt":"What is Effect for TypeScript?"}'
