import { messagingLayer } from "./messaging-helpers.js"
import { messagingPolicySuite } from "./messaging-policy-suite.js"
import { sqliteMessagingLayer } from "./sqlite-helpers.js"

messagingPolicySuite({ name: "memory", layer: messagingLayer })
messagingPolicySuite({ name: "sqlite", layer: sqliteMessagingLayer("messaging-policy") })
