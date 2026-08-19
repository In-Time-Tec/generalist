import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { layer as reactivityLayer } from "effect/unstable/reactivity/Reactivity"
import { makeSqlClient, type DurableObjectStorage } from "../src/durable-objects/index.js"

layer(reactivityLayer)("Durable Objects SQLite", (it) => {
  it.effect("constructs transactions from full DurableObjectStorage", () => {
    let transactions = 0
    const storage = {
      sql: {
        exec: () => ({ columnNames: [], raw: () => [] }),
      },
      transaction: (callback: (transaction: { readonly rollback: () => void }) => Promise<unknown>) => {
        transactions += 1
        return callback({ rollback: () => undefined })
      },
    } as unknown as DurableObjectStorage

    return Effect.gen(function* () {
      const sql = yield* makeSqlClient(storage)
      yield* sql.withTransaction(sql`SELECT 1`)
      expect(transactions).toBe(1)
    })
  })
})
