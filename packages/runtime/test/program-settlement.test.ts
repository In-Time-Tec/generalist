import { it } from "@effect/vitest"
import { Effect } from "effect"
import { Runtime } from "../src/index.js"
import { registrationsFor } from "./helpers.js"
import { programAddress, programExecutable, programFixture } from "./program-fixture.js"
import {
  programCancellationFenceContract,
  programCancellationFinalizerContract,
  programSettledReplayContract,
} from "./program-store-contract.js"
import { tempDbPath } from "./sqlite-helpers.js"

it.effect("fences stale Program settlement in memory and SQLite", () => {
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
  return contracts.pipe(
    Effect.provide(Runtime.layerMemory(address(memory.resolver))),
    Effect.andThen(
      contracts.pipe(
        Effect.provide(
          Runtime.layerSqlite({
            ...address(sqlite.resolver),
            filename: tempDbPath("program-settlement-contract"),
          }),
        ),
        Effect.scoped,
      ),
    ),
  )
})
