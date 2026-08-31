import { messagingDurabilitySuite } from "./durability.js"
import { sqliteLayer, tempDbPath } from "../../../sql/scenario.js"

messagingDurabilitySuite({ name: "sqlite", storeLayer: sqliteLayer(tempDbPath("messaging-durability")) })
