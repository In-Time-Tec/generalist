import "./suites/groups-suite.js"
import { childRunsRunGroupSuite } from "./suites/run-group.js"
import { objectLayer } from "../execution/fixtures.js"
childRunsRunGroupSuite({ name: "object", storeLayer: objectLayer })
