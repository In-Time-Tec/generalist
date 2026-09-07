import { objectRuntimeLayer } from "../execution/object.js"
import "./suites/settlement-notifications-suite.js"
import { layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { registrationsFor } from "../execution/fixtures.js"
import { programAddress, programExecutable, programFixture } from "../program/fixture.js"
import {
  programCancellationFenceContract,
  programCancellationFinalizerContract,
  programSettledReplayContract,
} from "../program/store-contract.js"
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
const contracts = programSettledReplayContract.pipe(
  Effect.andThen(programCancellationFinalizerContract),
  Effect.andThen(programCancellationFenceContract),
)

layer(objectRuntimeLayer(options).pipe(Layer.provide(fixture.resolverLayer)))(
  "fences stale Program settlement",
  (it) => {
    it.effect("fences stale Program settlement", () => contracts)
  },
)
