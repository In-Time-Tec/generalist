import { messagingAuthorizationSuite } from "./messaging-authorization-suite.js"
import { messagingLayer } from "./messaging-helpers.js"
import { sqliteMessagingLayer } from "./sqlite-helpers.js"

messagingAuthorizationSuite({ name: "memory", layer: messagingLayer })
messagingAuthorizationSuite({ name: "sqlite", layer: sqliteMessagingLayer("messaging-authorization") })
