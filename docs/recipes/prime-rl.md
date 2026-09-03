# Train with Prime RL

Run tasks through a durable Generalist Runtime, retain the forks, child Runs, and compactions that should be eligible for training, then project the root with the unstable RL exporter. Choose a gate, eval-scorer, or custom Effect reward policy and stream the resulting `verifiers-v1` JSONL bytes to the dataset location consumed by Prime RL.

Keep `include.logprobs` enabled only when the selected provider actually records token ids or log probabilities. Samples from providers that do not expose them are marked with `logprobs: null`; Generalist never estimates them. Use the include flags to exclude child or compacted paths that are outside the training objective. `speculationLosers` currently has no effect because speculative branches are not implemented yet.

The exported `env.taskset` is the root Agent name and `env.harness` identifies the exact Generalist package version. Reward facts are written back to the original Runtime journal, so preserve that journal alongside the exported dataset for audit and re-scoring.
