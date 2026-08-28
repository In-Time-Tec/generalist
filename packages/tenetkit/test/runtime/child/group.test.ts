import "./suites/groups-suite.js"
import { childRunsRunGroupSuite } from "./suites/run-group.js"
import { memoryLayer } from "../execution/fixtures.js"
import { sqliteLayer, tempDbPath } from "../sql/scenario.js"

childRunsRunGroupSuite({ name: "memory", storeLayer: memoryLayer })
childRunsRunGroupSuite({ name: "sqlite", storeLayer: sqliteLayer(tempDbPath("child-runs-run-group")) })
