import { childRunsRunGroupSuite } from "./child-runs-run-group-suite.js"
import { memoryLayer } from "./helpers.js"
import { sqliteLayer, tempDbPath } from "./sqlite-helpers.js"

childRunsRunGroupSuite({ name: "memory", storeLayer: memoryLayer })
childRunsRunGroupSuite({ name: "sqlite", storeLayer: sqliteLayer(tempDbPath("child-runs-run-group")) })
