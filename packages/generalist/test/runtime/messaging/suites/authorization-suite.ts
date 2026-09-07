import { messagingAuthorizationSuite } from "./authorization.js"
import { messagingLayer } from "../scenario.js"
messagingAuthorizationSuite({ name: "object", layer: messagingLayer })
