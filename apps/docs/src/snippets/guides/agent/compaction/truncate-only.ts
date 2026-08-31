import { Layer } from "effect"
import { Compaction } from "generalist"

export const truncateLayer: Layer.Layer<Compaction.Compaction> = Compaction.layerTest(Compaction.truncate(100_000))
