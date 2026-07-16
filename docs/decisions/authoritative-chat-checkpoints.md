# Make Chat checkpoints authoritative

Transformed response parts and completed tool results are committed to Chat before downstream observers. Suspension identity is stored on the unresolved call, and Session compaction stores exact projections. One authority avoids duplicate results, caller-invented resume calls, and drift between live Chat, persistence, memory, and Session replay.
