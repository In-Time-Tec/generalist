# Make Session history authoritative

Session is the only durable conversation authority. Hosted model completion commits the normalized response, post-usage checkpoint, Session `ModelResponse`, and semantic event in one store transaction. Chat is a process-local projection applied after acknowledgement; it has no separate persistence contract. This keeps replay, compaction, suspension, and model input on one path instead of reconciling competing histories.
