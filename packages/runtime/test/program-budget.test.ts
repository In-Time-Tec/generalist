import { it } from "@effect/vitest"
import { Effect } from "effect"
import { Runtime } from "../src/index.js"
import { registrationsFor } from "./helpers.js"
import { programAddress, programExecutable, programFixture } from "./program-fixture.js"
import { programBudgetContract } from "./program-store-contract.js"
import { tempDbPath } from "./sqlite-helpers.js"

it.effect("enforces every durable Program budget dimension in memory and SQLite", () => {
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
  return programBudgetContract.pipe(
    Effect.provide(Runtime.layerMemory(address(memory.resolver))),
    Effect.andThen(
      programBudgetContract.pipe(
        Effect.provide(
          Runtime.layerSqlite({ ...address(sqlite.resolver), filename: tempDbPath("program-budget-contract") }),
        ),
        Effect.scoped,
      ),
    ),
  )
})
