import { it, layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Runtime } from "../src/index.js"
import { registrationsFor } from "./helpers.js"
import { programAddress, programExecutable, programFixture } from "./program-fixture.js"
import {
  programCancellationFenceContract,
  programCancellationFinalizerContract,
  programSettledReplayContract,
} from "./program-store-contract.js"
import { tempDbPath } from "./sqlite-helpers.js"

const memory = programFixture()
const sqlite = programFixture()
const address = (resolver: typeof memory.resolver) => ({
  resolver,
  addresses: [
    {
      address: programAddress,
      executable: programExecutable,
      registrations: registrationsFor(programExecutable),
    },
  ],
})
const contracts = programSettledReplayContract.pipe(
  Effect.andThen(programCancellationFinalizerContract),
  Effect.andThen(programCancellationFenceContract),
)

layer(Runtime.layerMemory(address(memory.resolver)))(
  "fences stale Program settlement in memory and SQLite",
  (it) => {
    it.effect("fences stale Program settlement in memory and SQLite", () =>
      contracts.pipe(
        Effect.andThen(
          Effect.scoped(
            Effect.flatMap(
              Layer.build(
                Runtime.layerSqlite({
                  ...address(sqlite.resolver),
                  filename: tempDbPath("program-settlement-contract"),
                }),
              ),
              (context) => contracts.pipe(Effect.provideContext(context)),
            ),
          ),
        ),
      ),
    )
  },
)
