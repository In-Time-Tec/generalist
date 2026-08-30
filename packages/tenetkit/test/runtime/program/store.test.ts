import { layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Runtime } from "../../../src/runtime/index.js"
import { registrationsFor } from "../execution/fixtures.js"
import { programAddress, programExecutable, programFixture } from "./fixture.js"
import { programBudgetContract } from "./store-contract.js"
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

layer(Runtime.layerMemory(options).pipe(Layer.provide(memory.resolverLayer)))(
  "enforces every durable Program budget dimension in memory and SQLite",
  (it) => {
    it.effect("enforces every durable Program budget dimension in memory and SQLite", () =>
      programBudgetContract.pipe(
        Effect.andThen(
          Effect.scoped(
            Effect.flatMap(
              Layer.build(
                SqliteRuntime.layerSqlite({
                  ...options,
                  filename: tempDbPath("program-budget-contract"),
                }).pipe(Layer.provide(sqlite.resolverLayer)),
              ),
              (context) => programBudgetContract.pipe(Effect.provideContext(context)),
            ),
          ),
        ),
      ),
    )
  },
)
