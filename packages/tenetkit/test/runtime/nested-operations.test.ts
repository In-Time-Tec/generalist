import { memoryLayer } from "./helpers.js"
import { nestedOperationsSuite } from "./nested-operations-suite.js"
import { sqliteLayer, tempDbPath } from "./sqlite-helpers.js"

nestedOperationsSuite({ name: "memory", storeLayer: memoryLayer })
nestedOperationsSuite({ name: "sqlite", storeLayer: sqliteLayer(tempDbPath("nested-operations")) })
