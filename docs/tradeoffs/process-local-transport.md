# Process-local transport

An in-memory registry gives cheap replay, bounded queues, and straightforward Effect-scoped ownership. The cost is that frames, queued prompts, and suspended run state disappear with the process.

Adding hidden durability was rejected. Hosts that need recovery provide a durable `SessionRegistry` implementation instead.
