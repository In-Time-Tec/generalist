import { Schema } from "effect"
import { Response, Tool } from "effect/unstable/ai"
import { classify as classifyContextOverflow } from "../model/context-overflow.js"
import { ToolNameCollision } from "./agent-event.js"

export const classifyOtherFailure = (error: unknown) => classifyContextOverflow(error)

export const isToolNameCollision = Schema.is(ToolNameCollision)

export const attemptText = (parts: ReadonlyArray<Response.StreamPart<Record<string, Tool.Any>>>): string =>
  parts.reduce((text, part) => (part.type === "text-delta" ? `${text}${part.delta}` : text), "")
