import { Effect, Layer, Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, Permissions } from "../../../../src/index.js"
import { Address, ExecutableRegistration, ExecutableResolver } from "../../../../src/runtime/index.js"
import { TestModel } from "../../../../src/testing/index.js"
import { pinnedTestExecutable } from "../../../runtime/run/identity.js"

const visit = Tool.make("visit", { parameters: Schema.Struct({}), success: Schema.String })
const toolkit = Toolkit.make(visit)
const agent = Agent.make({ name: "alarm-host", toolkit })
export const executable = pinnedTestExecutable(agent)
export const address = Address.make("agent:alarm-host")
export const registrations = [...ExecutableRegistration.requiredPins(executable)].map((pin) => ({
  pin,
  codec: "alarm-fixture",
  version: "1",
  payload: {},
}))
export const options = {
  environment: "test",
  tenant: "cloudflare-host",
  partition: "shared",
  addresses: [{ address, executable, registrations }],
}

export const resolverLayer = (dispatch: Effect.Effect<void> = Effect.void) =>
  ExecutableResolver.layerStatic([
    {
      executable,
      agent: Agent.close(
        agent,
        Layer.mergeAll(
          Layer.unwrap(
            TestModel.make([TestModel.toolCall("visit", {}, { id: "visit-1" }), TestModel.text("finished")]).pipe(
              Effect.map((fixture) => fixture.layer),
            ),
          ),
          toolkit.toLayer({ visit: () => dispatch.pipe(Effect.as("visited")) }),
          Permissions.layerAllowAll,
          Approvals.layerAutoApprove,
        ),
      ),
    },
  ])

export const admission = (key: string) => ({
  runId: key,
  to: address,
  sessionId: `session:${key}`,
  idempotencyKey: key,
  prompt: "Visit once and finish.",
})
