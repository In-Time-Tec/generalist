import { objectRuntimeLayer } from "../execution/object.js"
import { layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Runtime } from "../../../src/runtime/index.js"
import { registrationsFor } from "../execution/fixtures.js"
import { programAddress, programExecutable, programFixture } from "./fixture.js"
import { programBudgetContract } from "./store-contract.js"
const fixture = programFixture()
const options = {
  addresses: [
    {
      address: programAddress,
      executable: programExecutable,
      registrations: registrationsFor(programExecutable),
    },
  ],
}

layer(objectRuntimeLayer(options).pipe(Layer.provide(fixture.resolverLayer)))(
  "enforces every durable Program budget dimension",
  (it) => {
    it.effect("enforces every durable Program budget dimension", () => programBudgetContract)
  },
)
