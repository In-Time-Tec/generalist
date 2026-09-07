curl -Ns "http://localhost:4000/sessions/${SESSION_ID:?run open-session.sh first}/events" \
  -H "authorization: Bearer ${GENERALIST_SERVER_TOKEN:?set GENERALIST_SERVER_TOKEN}" | awk '
  /^event: ApprovalRequested$/ { approval = 1 }
  approval && /^$/ { exit }
  { print }
'
