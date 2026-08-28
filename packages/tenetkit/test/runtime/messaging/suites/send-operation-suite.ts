import { messagingLayer } from "../scenario.js"
import { messagingSendOperationSuite } from "./send-operation.js"
import { sqliteMessagingLayer } from "../../sql/scenario.js"

messagingSendOperationSuite({ name: "memory", layer: messagingLayer })
messagingSendOperationSuite({ name: "sqlite", layer: sqliteMessagingLayer("messaging-send-operation") })
