# Testing and Evals

Use deterministic model layers, `testLayer`s, and private example workspaces for tests. Most Baton seams can be replaced with in-memory layers, so CI does not need live LLM credentials.

For evals, keep the primary pass/fail deterministic, then add optional LLM-judge jobs outside the default CI path. The `eval-in-ci` example shows a deterministic assertion over `Agent.generate`.

Runnable workflow: [`../../../examples/eval-in-ci/README.md`](../../../examples/eval-in-ci/README.md).
