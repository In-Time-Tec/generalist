import "./suites/staged-root-suite.js"
import { objectLayer } from "../execution/fixtures.js"
import { nestedOperationsSuite } from "./suites/nested.js"

nestedOperationsSuite({ name: "object", storeLayer: objectLayer })
