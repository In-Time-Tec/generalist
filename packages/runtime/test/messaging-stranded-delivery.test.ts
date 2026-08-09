import { messagingLayer } from "./messaging-helpers.js"
import { sqliteLayer, tempDbPath } from "./sqlite-helpers.js"
import { strandedDeliverySuite } from "./stranded-delivery-suite.js"

strandedDeliverySuite({ name: "memory", storeLayer: messagingLayer({}) })
strandedDeliverySuite({ name: "sqlite", storeLayer: sqliteLayer(tempDbPath("stranded-delivery")) })
