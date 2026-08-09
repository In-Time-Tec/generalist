import { messagingLayer } from "./messaging-helpers.js"
import { messagingMailboxSuite } from "./messaging-mailbox-suite.js"
import { sqliteMessagingLayer } from "./sqlite-helpers.js"

messagingMailboxSuite({ name: "memory", layer: messagingLayer })
messagingMailboxSuite({ name: "sqlite", layer: sqliteMessagingLayer("messaging-mailbox") })
