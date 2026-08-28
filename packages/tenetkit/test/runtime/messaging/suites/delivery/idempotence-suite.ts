import { messagingDeliveryIdempotenceSuite } from "./idempotence.js"
import { messagingLayer } from "../../scenario.js"
import { sqliteMessagingLayer } from "../../../sql/scenario.js"

messagingDeliveryIdempotenceSuite({ name: "memory", layer: messagingLayer })
messagingDeliveryIdempotenceSuite({ name: "sqlite", layer: sqliteMessagingLayer("messaging-delivery-idempotence") })
