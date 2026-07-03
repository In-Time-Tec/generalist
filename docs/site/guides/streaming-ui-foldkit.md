# Streaming to a UI and FoldKit

`@batonfx/transport` turns `Agent.stream` into replayable wire frames through `SessionRegistry`, SSE, WebSocket, and an isomorphic client. Frames are session-sequenced and replayable; terminal outcomes are data frames.

`@batonfx/foldkit` adapts those frames into FoldKit resources, subscriptions, commands, and a headless chat model. It is not a styled UI and not a durable runtime.

Runnable workflow: [`../../../examples/capstone-local-assistant/README.md`](../../../examples/capstone-local-assistant/README.md).
