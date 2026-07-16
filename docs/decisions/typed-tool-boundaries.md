# Separate domain and framework failures

Declared tool failures remain values admitted by the tool's failure schema. Schema, handler-boundary, routing, placement, and authorization failures use a separate typed framework error channel. This prevents infrastructure faults from impersonating model-visible domain results and keeps every emitted tool result schema-valid.
