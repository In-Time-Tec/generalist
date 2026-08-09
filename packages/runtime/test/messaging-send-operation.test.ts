import { messagingLayer } from "./messaging-helpers.js"
import { messagingSendOperationSuite } from "./messaging-send-operation-suite.js"
import { sqliteMessagingLayer } from "./sqlite-helpers.js"

messagingSendOperationSuite({ name: "memory", layer: messagingLayer })
messagingSendOperationSuite({ name: "sqlite", layer: sqliteMessagingLayer("messaging-send-operation") })
