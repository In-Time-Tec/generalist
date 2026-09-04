import { Compaction } from "generalist"

// Exact: declares the Tokenizer requirement on the layer.
export const truncateLayer = Compaction.layerTruncate(100_000)

// Approximate: drops oldest messages by the token estimator, no Tokenizer needed.
export const estimatedLayer = Compaction.layerTruncateEstimated(100_000)
