import { Schema } from "effect"
import { classify as classifyContextOverflow } from "../model/context-overflow.js"
import { ToolNameCollision } from "./agent-event.js"

export const classifyOtherFailure = (error: unknown) => classifyContextOverflow(error)

export const isToolNameCollision = Schema.is(ToolNameCollision)
