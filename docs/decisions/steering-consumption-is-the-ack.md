# Steering consumption is the message ack

Addressed messaging has no ack call. A message is pending until a model operation consumes the steering entry carrying it, and that consumption commits in the same transaction as the operation itself.

The contract is **at-least-once bind, exactly-once consume**. `deliverPendingMessages` binds each pending entry to the target Run's steering inbox; the agent loop drains steering only at a turn boundary. Binding is not delivery: a Run that takes a message and then reaches `succeeded`, `failed`, or `cancelled` without consuming it returns that message to pending for the session's next Run. `stranded-delivery-suite.ts` asserts each half — a bound-but-unconsumed message comes back after both a failure and a cancellation, a consumed message does not come back after the Run dies, and a live holder keeps its message out of pending.

An explicit ack was rejected because it introduces a second commit point. That commit's own failure window can only lose a message or duplicate one, and neither is recoverable from the outside: the model has already seen the content. Consuming inside the model operation's commit means the journal records a message as consumed exactly once.

Exactly-once is a property of the journal, not of what a model observed. The steering entries a turn drains are folded into that turn's prompt before the operation they belong to reaches its checkpoint, so a Run that dies between the model seeing the text and the operation committing leaves the entry pending, and the session's next Run delivers it again. That window is the price of having one commit point rather than two: an ack would move the window rather than close it, and would move it to a place where the message can be lost instead of repeated. A message repeated across a crash is recoverable by the model reading it twice; a message lost is not.

`deliveredRunId` records which Run currently holds an entry. It is attribution and diagnostics only, never the authority for pending-ness. A pending query filtered on `deliveredRunId` alone would strand a message on a Run that died holding it, which is exactly the failure the consumption rule exists to prevent.
