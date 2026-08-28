import { Console, Effect } from "effect"
import { Permissions } from "tenetkit"

const ruleset: Permissions.Ruleset = {
  rules: [
    { pattern: "read_*", level: "allow" },
    { pattern: "bash:*rm -rf*", level: "deny", reason: "Destructive commands are blocked" },
    { pattern: "deploy_*", level: "ask" },
  ],
  fallback: "ask",
}

const program = Effect.gen(function* () {
  yield* Console.log(Permissions.evaluate(ruleset, "read_file", { path: "README.md" }))
  yield* Console.log(Permissions.evaluate(ruleset, "bash", { command: "rm -rf ./cache" }))
  yield* Console.log(Permissions.evaluate(ruleset, "deploy_service", { service: "api" }))
  yield* Console.log(Permissions.evaluate(ruleset, "send_email", { to: "ada@example.com" }))
  yield* Console.log(String(Permissions.matches("bash:git *", "bash", { command: "git status" })))
})

await Effect.runPromise(program)
