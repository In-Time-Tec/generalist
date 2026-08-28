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

layer(Runtime.layerMemory(address(memory.resolver)))(
  "enforces every durable Program budget dimension in memory and SQLite",
  (it) => {
    it.effect("enforces every durable Program budget dimension in memory and SQLite", () =>
      programBudgetContract.pipe(
        Effect.andThen(
          Effect.scoped(
            Effect.flatMap(
              Layer.build(
                SqliteRuntime.layerSqlite({
                  ...address(sqlite.resolver),
                  filename: tempDbPath("program-budget-contract"),
                }),
              ),
              (context) => programBudgetContract.pipe(Effect.provideContext(context)),
            ),
          ),
        ),
      ),
    )
  },
)
