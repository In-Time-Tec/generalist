import "./suites/admission-bounds-suite.js"
import { childAdmissionSuite } from "./suites/admission.js"
import { objectLayer } from "../execution/fixtures.js"
childAdmissionSuite({ name: "object", storeLayer: objectLayer })
