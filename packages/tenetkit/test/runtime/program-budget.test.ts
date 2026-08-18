import { layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Runtime } from "../../src/runtime/index.js"
import { registrationsFor } from "./helpers.js"
import { programAddress, programExecutable, programFixture } from "./program-fixture.js"
import { programBudgetContract } from "./program-store-contract.js"
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

layer(Runtime.layerMemory(address(memory.resolver)))(
  "enforces every durable Program budget dimension in memory and SQLite",
  (it) => {
    it.effect("enforces every durable Program budget dimension in memory and SQLite", () =>
      programBudgetContract.pipe(
        Effect.andThen(
          Effect.scoped(
            Effect.flatMap(
              Layer.build(
                Runtime.layerSqlite({ ...address(sqlite.resolver), filename: tempDbPath("program-budget-contract") }),
              ),
              (context) => programBudgetContract.pipe(Effect.provideContext(context)),
            ),
          ),
        ),
      ),
    )
  },
)
