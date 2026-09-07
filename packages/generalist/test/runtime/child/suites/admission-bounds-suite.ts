import { childAdmissionBoundsSuite } from "./admission-bounds.js"
import { objectLayer } from "../../execution/fixtures.js"
childAdmissionBoundsSuite({ name: "object", storeLayer: objectLayer })
