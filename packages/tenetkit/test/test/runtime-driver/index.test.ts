import { driverConformance, type ClaimExecution } from "tenetkit/test/runtime-driver"
import { Effect } from "effect"
import { assistantAddress, memoryLayer } from "../../runtime/execution/fixtures.js"
import { sqliteLayer, tempDbPath } from "../../runtime/sql/scenario.js"

const claim: ClaimExecution = ({ store }, { runId, workerId }) =>
  store.claimExecution({ runId, ownerId: workerId }).pipe(Effect.orDie)

driverConformance({
  name: "memory",
  address: assistantAddress,
  layer: memoryLayer,
  capabilities: {
    admission: true,
    runtime: { claim },
    runTree: { claim },
  },
})

driverConformance({
  name: "sqlite",
  address: assistantAddress,
  layer: sqliteLayer(tempDbPath("runtime-driver-conformance")),
  capabilities: {
    admission: true,
    runtime: { claim },
    runTree: { claim },
  },
})
