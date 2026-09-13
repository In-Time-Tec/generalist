import { Schema } from "effect"
import { CapabilityPin, makeCapability } from "../core/durable/pin.js"
import { Identity, type Declaration, type Service } from "./definition.js"

export const chainPin = (declarations: ReadonlyArray<Declaration>): CapabilityPin => {
  const identities = declarations.map((declaration) => ({
    ...Schema.decodeSync(Identity)(declaration),
    event: declaration.event,
  }))
  if (new Set(identities.map((identity) => identity.key)).size !== identities.length) {
    throw new TypeError("Duplicate hook declaration key")
  }
  return makeCapability({ version: "1", declarations: identities })
}

export const make = (input: { readonly declarations: ReadonlyArray<Declaration> }): Service => {
  const declarations = Object.freeze(input.declarations.map((declaration) => Object.freeze({ ...declaration })))
  chainPin(declarations)
  return { declarations }
}
