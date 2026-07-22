# Session and compaction

Core `Session` is an append-only conversation-entry log with a current leaf. Context is projected from a root-to-leaf path; durable storage belongs to hosts.

Compaction is optional. With Session enabled, every changed projection commits through one versioned checkpoint containing a stable id, expected parent leaf, and exact projected Chat history. The store validates the parent and handles identical checkpoint retries idempotently. Baton appends the checkpoint before applying its projection to Chat, so a definite store failure leaves Chat unchanged. A selected model's classified pre-output context overflow, including a decoded model error part, forces one compacted replay; a second overflow fails the run.

A dedicated summary-model layer is built through the owning scope's memo map and reused across compaction calls in that scope.

A compaction pass that decides to do work emits `CompactionStarted` (bounded trigger, context tokens and entry counts before when known) and a terminal `CompactionCompleted` (`microcompact`, `summarize`, or `unchanged`) or `CompactionFailed` at real clock boundaries. `CompactionCompleted` marks the pass producing its result; checkpoint and projection application follow, and their failure fails the run typed. Summary model work runs through the ordinary model-call lifecycle with purpose `compaction-summary`: its `ModelCallStarted` carries the pass's `compactionId`, and `CompactionCompleted` carries `summaryModelCallId` when a summary call ran.

Session entry identity, not projected message count, tracks sync progress. Divergence or ambiguous alignment fails typed rather than guessing, and the failure carries bounded `SessionSync.Diagnostics`: identifiers, entry and message counts, alignment count, longest common prefix, and the first divergent roles, part types, and digests — never raw prompt, message, or tool payload text. Without Compaction, transcript behavior is unchanged.

Hosts that need write fencing pass `RunOptions.sessionOwnerToken`. Baton forwards the token verbatim on every Session append and compaction checkpoint (`AppendOptions.ownerToken`, `PreparedCheckpoint.ownerToken`). A durable store that no longer recognizes the token rejects the write with `SessionConflict` reason `fenced`, which fails the run typed instead of letting a stale writer advance the session.
