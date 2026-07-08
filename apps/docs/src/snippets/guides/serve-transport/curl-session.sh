curl -s -X POST localhost:4000/sessions -H 'content-type: application/json' -d '{"sessionId":"docs-1"}'
curl -s -X POST localhost:4000/sessions/docs-1/messages -H 'content-type: application/json' -d '{"prompt":"Research Effect fibers"}'
curl -N localhost:4000/sessions/docs-1/events
