import { Layer } from "effect"
import { Compaction } from "@batonfx/core"

export const truncateLayer: Layer.Layer<Compaction.Compaction> = Compaction.testLayer(Compaction.truncate(100_000))
