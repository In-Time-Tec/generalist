// oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- Reopen tests intentionally construct one shared object bucket for two fresh Runtime Layers.
import { makeObjectStorage } from "../../../execution/object.js"
import { messagingLayer } from "../../scenario.js"
import { messagingDurabilitySuite } from "./durability.js"

messagingDurabilitySuite({
  name: "object",
  layers: () => {
    const storage = makeObjectStorage()
    return {
      admit: messagingLayer({}, storage),
      reopen: messagingLayer({}, storage),
    }
  },
})
