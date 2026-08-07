import { Layer } from "effect"
import { HandoffCatalog, layerCatalog } from "../src/policy/handoff-target.js"

/** @experimental Empty handoff catalog for agent-run test hosts. */
export const layerHandoffCatalogTest: Layer.Layer<HandoffCatalog> = layerCatalog([])
