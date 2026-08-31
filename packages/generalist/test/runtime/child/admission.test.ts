import "./suites/admission-bounds-suite.js"
import { childAdmissionSuite } from "./suites/admission.js"
import { memoryLayer } from "../execution/fixtures.js"
import { sqliteLayer, tempDbPath } from "../sql/scenario.js"

childAdmissionSuite({ name: "memory", storeLayer: memoryLayer })
childAdmissionSuite({ name: "sqlite", storeLayer: sqliteLayer(tempDbPath("child-admission")) })
