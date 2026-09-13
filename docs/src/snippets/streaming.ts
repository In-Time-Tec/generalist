import { BunRuntime } from "@effect/platform-bun"
import { Console, Effect, Stream } from "effect"
import { Agent } from "generalist"
import { layer, text } from "generalist/testing/model"

const coder = Agent.make({ name: "coding-agent" })

BunRuntime.runMain(
  Agent.stream(coder, "Report your proposed fix for average([]).").pipe(
    Stream.filter((event) => event._tag === "Completed"),
    Stream.runForEach((event) => Console.log(event.output)),
    Effect.provide(layer([text("The empty-input guard is ready for review.")])),
  ),
)
