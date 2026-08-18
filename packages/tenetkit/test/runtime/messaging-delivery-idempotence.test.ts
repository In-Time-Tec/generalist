import { messagingDeliveryIdempotenceSuite } from "./messaging-delivery-idempotence-suite.js"
import { messagingLayer } from "./messaging-helpers.js"
import { sqliteMessagingLayer } from "./sqlite-helpers.js"

messagingDeliveryIdempotenceSuite({ name: "memory", layer: messagingLayer })
messagingDeliveryIdempotenceSuite({ name: "sqlite", layer: sqliteMessagingLayer("messaging-delivery-idempotence") })
