import { Schema } from "effect"
import { make } from "../core/durable/component.js"
import { Items } from "./item.js"

export const declaration = make({
  descriptor: {
    version: "1",
    key: "generalist.tasks",
    instance: "default",
    schemaVersion: "1",
    handler: "replace",
    handlerVersion: "1",
    scope: "run",
    branch: "restore",
    redaction: "visible",
    maxStateBytes: 65_536,
    maxCommandBytes: 65_536,
    maxReceiptBytes: 1_048_576,
  },
  state: Items,
  command: Schema.Struct({ items: Items }),
  initial: [],
  transition: (_, command) => command.items,
})
