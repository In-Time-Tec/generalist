import { messagingLayer } from "./scenario.js"
import { messagingMailboxSuite } from "./suites/mailbox.js"
messagingMailboxSuite({ name: "object", layer: messagingLayer })
