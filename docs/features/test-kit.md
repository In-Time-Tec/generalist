# Test kit

`@batonfx/test` supplies a scripted Effect AI language model and normalized request capture without credentials or a test-runner dependency.

One fixture owns one atomic FIFO script cursor across streaming and non-streaming calls. Requests are captured before scripted delay or failure. A claimed slot stays consumed after failure or interruption; retries consume later slots. Exhausted calls are still captured and fail with Effect AI `InvalidRequestError`.

Fixtures expose direct and `ModelRegistry` layers, captured prompts and requests, remaining slots, and Effect-based request waiting. Rebuilding a fixture's layer does not reset its state. `TestModel.turn(parts, { streamPartDelay })` delays every encoded provider part independently, so integration tests can observe reasoning, text, tool, and finish transitions instead of receiving a scripted response in one scheduler turn.

`TestModel.truncated(parts, { stopAfter })` scripts a streaming turn whose body ends without a `finish` part, reproducing a provider response that reached EOF before its terminal event. It emits `response-metadata` first, then the leading parts in full, and stops at the named point: `stopAfter: "tool-params-delta"` emits `tool-params-start` and unclosed parameter JSON but never the closing `tool-call`. Truncated steps are streaming-only.
