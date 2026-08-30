import "./suites/settlement-notifications-suite.js"
import { layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Runtime } from "../../../src/runtime/index.js"
import { registrationsFor } from "../execution/fixtures.js"
import { programAddress, programExecutable, programFixture } from "../program/fixture.js"
import {
  programCancellationFenceContract,
  programCancellationFinalizerContract,
  programSettledReplayContract,
} from "../program/store-contract.js"
import { tempDbPath } from "../sql/scenario.js"

import { Runtime as SqliteRuntime } from "../../../src/runtime/sqlite-bun.js"
const memory = programFixture()
const sqlite = programFixture()
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

layer(Runtime.layerMemory(options).pipe(Layer.provide(memory.resolverLayer)))(
  "fences stale Program settlement in memory and SQLite",
  (it) => {
    it.effect("fences stale Program settlement in memory and SQLite", () =>
      contracts.pipe(
        Effect.andThen(
          Effect.scoped(
            Effect.flatMap(
              Layer.build(
                SqliteRuntime.layerSqlite({
                  ...options,
                  filename: tempDbPath("program-settlement-contract"),
                }).pipe(Layer.provide(sqlite.resolverLayer)),
              ),
              (context) => contracts.pipe(Effect.provideContext(context)),
            ),
          ),
        ),
      ),
    )
  },
)
