import { driverConformance, type ClaimExecution } from "tenetkit/test/runtime-driver"
import { Effect } from "effect"
import { assistantAddress, memoryLayer } from "../../runtime/execution/fixtures.js"

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
