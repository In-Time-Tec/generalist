import { Effect, Schema } from "effect"
import type { State } from "../../durability/internal/journal.js"
import type { Patch, Json } from "../../durability/internal/protocol.js"

export interface QualificationTransition {
  readonly patches: ReadonlyArray<Patch>
  readonly receipt: Json
}

export const transition = (input: {
  readonly id: string
  readonly state: State
}): Effect.Effect<QualificationTransition> => {
  const count = Schema.is(Schema.Finite)(input.state.count) ? input.state.count + 1 : 1
  const patches: Array<Patch> = [{ op: "set", path: ["count"], value: count }]
  if (input.state.commands === undefined) patches.push({ op: "set", path: ["commands"], value: {} })
  patches.push({ op: "set", path: ["commands", input.id], value: true })
  return Effect.succeed({ patches, receipt: { count } })
}
