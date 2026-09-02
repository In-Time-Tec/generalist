# Steering consumption is the message ack

Run messaging has no ack call. A message is pending until a model operation consumes its inbox entry, and that consumption commits in the same transaction as the operation itself.

`Runtime.send` appends the `Inbox` event and pending row atomically to one exact target Run. Direct and addressed sends use this same admission. The agent loop observes an entry only at the boundary selected by its policy, and the entry remains pending until the next model operation commits `SteeringConsumed`. If the Run becomes terminal first, terminalization records the entry's disposition instead of moving it to another Run.

An explicit ack was rejected because it introduces a second commit point. That commit's own failure window can only lose a message or duplicate one, and neither is recoverable from the outside: the model has already seen the content. Consuming inside the model operation's commit means the journal records a message as consumed exactly once.

Exactly-once is a property of the journal, not of what a model observed. The inbox entries a turn drains are folded into that turn's prompt before the operation reaches its checkpoint. A process loss between provider visibility and operation commit leaves the entry pending, so recovery may show the same text to the model again without redispatching a committed entry. That window is the price of one commit point rather than two: an ack would move the window to a place where messages can be lost instead of repeated.
