# Providers

Core selects models through provider-agnostic `ModelRegistry` registrations. A missing registration fails typed.

`operate` retains a selected model layer and optional semaphore permit for the whole Effect. `stream` retains both through stream consumption, including failure, interruption, and early downstream termination. Per-run model layers bypass registry selection.

`@batonfx/providers` adapts upstream Effect AI providers, embeddings, deterministic models, and optional static model metadata. Core never imports provider SDKs.

OpenAI, Anthropic, and OpenRouter registrations classify context-window rejection from provider-specific structured metadata and narrow provider messages. The agent loop consults only the selected registration before reactive compaction. Unknown OpenAI-compatible endpoints classify no failures by default; callers can opt into a known `FailureClassifier` through `OpenAiCompatibleInput.classifyFailure`.

The OpenAI account registration resolves host-owned credentials for each Responses request. Baton fixes the account endpoint, adds bearer and account headers, preserves Responses request and stream conversion, and permits one refresh callback and replay only for a pre-emission 401. The rejected credential generation is passed to the host callback for refresh serialization. Baton does not follow account-response redirects, retry a second 401 or another failure, or place account credentials in registration identity and metadata.

The host owns OpenAI browser or device authorization, PKCE and callback handling, token persistence, proactive refresh, and cross-process refresh coordination. Baton owns no OAuth authorization flow or credential store.
