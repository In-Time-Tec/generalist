curl -Ns "http://localhost:4000/sessions/${SESSION_ID:?run open-session.sh first}/events" | awk '
  /^event: ApprovalRequested$/ { approval = 1 }
  approval && /^$/ { exit }
  { print }
'
