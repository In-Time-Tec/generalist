import { messagingLayer } from "../../scenario.js"
import { sqliteLayer, tempDbPath } from "../../../sql/scenario.js"
import { strandedDeliverySuite } from "./stranded.js"

strandedDeliverySuite({ name: "memory", storeLayer: messagingLayer({}) })
strandedDeliverySuite({ name: "sqlite", storeLayer: sqliteLayer(tempDbPath("stranded-delivery")) })
