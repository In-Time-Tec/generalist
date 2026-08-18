import { Layer } from "effect"
import { Compaction } from "tenetkit"

export const truncateLayer: Layer.Layer<Compaction.Compaction> = Compaction.layerTest(Compaction.truncate(100_000))
