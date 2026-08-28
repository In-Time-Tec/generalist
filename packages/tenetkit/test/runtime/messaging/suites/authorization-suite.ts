import { messagingAuthorizationSuite } from "./authorization.js"
import { messagingLayer } from "../scenario.js"
import { sqliteMessagingLayer } from "../../sql/scenario.js"

messagingAuthorizationSuite({ name: "memory", layer: messagingLayer })
messagingAuthorizationSuite({ name: "sqlite", layer: sqliteMessagingLayer("messaging-authorization") })
