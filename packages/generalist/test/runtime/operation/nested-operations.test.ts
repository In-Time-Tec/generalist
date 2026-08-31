import "./suites/staged-root.js"
import { memoryLayer } from "../execution/fixtures.js"
import { nestedOperationsSuite } from "./suites/nested.js"
import { sqliteLayer, tempDbPath } from "../sql/scenario.js"

nestedOperationsSuite({ name: "memory", storeLayer: memoryLayer })
nestedOperationsSuite({ name: "sqlite", storeLayer: sqliteLayer(tempDbPath("nested-operations")) })
