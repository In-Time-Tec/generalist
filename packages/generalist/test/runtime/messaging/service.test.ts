import "./suites/send-operation-suite.js"
import "./suites/delivery/durability-suite.js"
import "./suites/delivery/service-suite.js"
import "./suites/contracts-suite.js"
import "./suites/authorization-suite.js"
import { messagingLayer } from "./scenario.js"
import { messagingPolicySuite } from "./suites/policy.js"
messagingPolicySuite({ name: "object", layer: messagingLayer })
