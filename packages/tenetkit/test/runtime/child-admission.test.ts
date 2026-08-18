import { childAdmissionSuite } from "./child-admission-suite.js"
import { memoryLayer } from "./helpers.js"
import { sqliteLayer, tempDbPath } from "./sqlite-helpers.js"

childAdmissionSuite({ name: "memory", storeLayer: memoryLayer })
childAdmissionSuite({ name: "sqlite", storeLayer: sqliteLayer(tempDbPath("child-admission")) })
