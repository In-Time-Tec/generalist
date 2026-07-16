# Test kit

`@batonfx/test` supplies a scripted Effect AI language model and normalized request capture without credentials or a test-runner dependency.

One fixture owns one atomic FIFO script cursor across streaming and non-streaming calls. Requests are captured before scripted delay or failure. A claimed slot stays consumed after failure or interruption; retries consume later slots. Exhausted calls are still captured and fail with Effect AI `InvalidRequestError`.

Fixtures expose direct and `ModelRegistry` layers, captured prompts and requests, remaining slots, and Effect-based request waiting. Rebuilding a fixture's layer does not reset its state.
