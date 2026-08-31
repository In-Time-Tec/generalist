import { childAdmissionBoundsSuite } from "./admission-bounds.js"
import { memoryLayer } from "../../execution/fixtures.js"
import { sqliteLayer, tempDbPath } from "../../sql/scenario.js"

childAdmissionBoundsSuite({ name: "memory", storeLayer: memoryLayer })
childAdmissionBoundsSuite({ name: "sqlite", storeLayer: sqliteLayer(tempDbPath("child-admission-bounds")) })
