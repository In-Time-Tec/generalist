# Providers

Core selects models through provider-agnostic `ModelRegistry` registrations. A missing registration fails typed.

`operate` retains a selected model layer and optional semaphore permit for the whole Effect. `stream` retains both through stream consumption, including failure, interruption, and early downstream termination. Per-run model layers bypass registry selection.

`@batonfx/providers` adapts upstream Effect AI providers, embeddings, deterministic models, and optional static model metadata. Core never imports provider SDKs.
