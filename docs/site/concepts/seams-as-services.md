# Seams as Services

Baton extension points are Effect services and layers. A plugin is a Layer.

Required loop services are the language model, `ToolExecutor`, `Approvals`, and `ModelMiddleware`. Optional seams such as instructions, permissions, steering, compaction, memory, tool-output spill, and model resilience are discovered only where the spec says they are optional.

This keeps applications small: provide only the seams you need. Tests can swap every behavior-bearing seam with a `testLayer` or memory layer, and durable hosts can replace in-process layers without Baton importing durable runtime code.
