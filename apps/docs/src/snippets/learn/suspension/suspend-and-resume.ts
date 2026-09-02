import { Console, Effect, Layer, ManagedRuntime, Schema, Stream } from "effect"
import { Agent, AgentEvent, Approvals, ModelMiddleware, Permissions } from "generalist"
import { Prompt, Tool, Toolkit } from "effect/unstable/ai"
import { TestModel } from "generalist/testing"

const deployTool = Tool.make("deploy", {
  description: "Deploy a service to production",
  parameters: Schema.Struct({ service: Schema.String }),
  success: Schema.String,
  needsApproval: true,
})

const toolkit = Toolkit.make(deployTool)

const agent = Agent.make({
  name: "release-agent",
  instructions: "Deploy what the user asks for.",
  toolkit,
})

const modelLayer = TestModel.layer([
  TestModel.toolCall("deploy", { service: "api" }, { id: "deploy-1" }),
  TestModel.text("The api service is deployed."),
])

let approvalChecks = 0

const layers = Layer.mergeAll(
  modelLayer,
  toolkit.toLayer({ deploy: () => Effect.succeed("deployed api") }),
  Permissions.layerAllowAll,
  Approvals.layerTest({
    resolve: (pending) => {
      approvalChecks += 1
      return Effect.succeed<Approvals.Resolution>(
        approvalChecks === 1 ? { ...pending, token: "approval-deploy-1" } : { _tag: "Approved" },
      )
    },
  }),
  ModelMiddleware.layerIdentity,
)

let transcript: Prompt.Prompt = Prompt.empty

const program = Effect.gen(function* () {
  const suspension = yield* Agent.stream(agent, "Deploy the api service.").pipe(
    Stream.runForEach((event) =>
      Effect.sync(() => {
        if (event._tag === "TurnCompleted") transcript = event.transcript
      }),
    ),
    Effect.flatMap(() => Effect.die("expected the run to suspend")),
    Effect.catchIf(
      (error): error is AgentEvent.AgentSuspended => Schema.is(AgentEvent.AgentSuspended)(error),
      (error) => Effect.succeed(error),
    ),
  )
  const [wait] = suspension.waits
  if (wait === undefined) {
    return yield* Effect.die("expected an approval wait")
  }
  yield* Console.log(`suspended reason=${wait.reason} tool=${wait.call.name} token=${wait.token}`)
  const result = yield* Agent.run(agent, "", {
    history: transcript,
    resume: {
      suspension,
      resolutions: [{ waitId: wait.waitId, resolution: { _tag: "Approved" } }],
    },
  })
  yield* Console.log(result)
})

const runtime = ManagedRuntime.make(layers)
await runtime.runPromise(program)
