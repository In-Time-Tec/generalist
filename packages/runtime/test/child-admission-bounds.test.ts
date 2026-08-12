import { childAdmissionBoundsSuite } from "./child-admission-bounds-suite.js"
import { memoryLayer } from "./helpers.js"
import { sqliteLayer, tempDbPath } from "./sqlite-helpers.js"

childAdmissionBoundsSuite({ name: "memory", storeLayer: memoryLayer })
childAdmissionBoundsSuite({ name: "sqlite", storeLayer: sqliteLayer(tempDbPath("child-admission-bounds")) })
