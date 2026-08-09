import { messagingDurabilitySuite } from "./messaging-durability-suite.js"
import { sqliteLayer, tempDbPath } from "./sqlite-helpers.js"

messagingDurabilitySuite({ name: "sqlite", storeLayer: sqliteLayer(tempDbPath("messaging-durability")) })
