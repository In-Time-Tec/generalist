# Session and compaction

Core `Session` is an append-only conversation-entry log with a current leaf. Context is projected from a root-to-leaf path; durable storage belongs to hosts.

Compaction is optional. With Session enabled, every changed projection commits through one versioned checkpoint containing a stable id, expected parent leaf, and exact projected Chat history. The store validates the parent and handles identical checkpoint retries idempotently. Baton appends the checkpoint before applying its projection to Chat, so a definite store failure leaves Chat unchanged.

A dedicated summary-model layer is built through the owning scope's memo map and reused across compaction calls in that scope.

Session entry identity, not projected message count, tracks sync progress. Divergence or ambiguous alignment fails typed rather than guessing. Without Compaction, transcript behavior is unchanged.
