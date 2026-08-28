import { messagingLayer } from "./scenario.js"
import { messagingMailboxSuite } from "./suites/mailbox.js"
import { sqliteMessagingLayer } from "../sql/scenario.js"

messagingMailboxSuite({ name: "memory", layer: messagingLayer })
messagingMailboxSuite({ name: "sqlite", layer: sqliteMessagingLayer("messaging-mailbox") })
