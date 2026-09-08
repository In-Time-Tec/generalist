# Memory Chat

Keep a user's context available across agent calls without resending it manually. This example runs two local turns with the same explicit memory key; the second receives working-memory recall without a durable store or live embeddings.

```bash
bun --cwd examples/memory-chat start
```

The scripted model needs no credentials. Working memory lives in this process and is lost when it exits; it is not the optional durable Runtime or a restart-safe conversation store. The application chooses the memory key and must authorize who can use it.
