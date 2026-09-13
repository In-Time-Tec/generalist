import { Schema } from "effect"
import { Result } from "./definition.js"

/** One keyed result retained in the durable loop checkpoint. */
export const Checkpoint = Schema.Struct({ key: Schema.String, turn: Schema.Finite, result: Result })
export type Checkpoint = typeof Checkpoint.Type
