---
title: "How to gate tools with permission rules"
description: "Write allow, deny, and ask rulesets, resolve asks with Approvals, and remember decisions with a RuleStore."
---

The `Permissions` service is host policy for tool calls: before every call, the loop asks it to `allow`, `deny`, or `ask`. Allow continues into the normal approval path, deny fails the run with a typed authorization framework error, and ask enters the approval resolution flow. Permissions runs before [Approvals](/guides/approvals); there is one resolution vocabulary and one resume path.

## 1. Write an ordered ruleset

A rule is a glob pattern plus a level. Plain patterns match the tool name; a `tool:params` pattern also matches against the call's parameter text. Later rules win, and `fallback` covers everything unmatched (it defaults to `"ask"`). `Permissions.evaluate` and `Permissions.matches` let you test a ruleset as a pure function:

**evaluate-ruleset.ts**

```typescript
import { Console, Effect } from "effect"
import { Permissions } from "generalist"

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
```

**Output**

```text
allow
deny
ask
ask
true
```

<Warning title="Deny rules fail closed">
When a call's params cannot be fully projected to text, a matching deny-level tool pattern still denies. Prefer deny rules for anything destructive.
</Warning>

## 2. Provide the layer and watch a denial

`Permissions.layerRuleset` turns the ruleset into a static policy layer. A denied call never reaches the executor: the host receives your `reason` in a typed `PermissionDenied`, which the host handles without inventing a value outside the tool's declared failure schema:

**deny-in-the-loop.ts**

```typescript
import { Console, Effect, Layer, ManagedRuntime, Schema } from "effect"
import { Agent, Approvals, ModelMiddleware, Permissions } from "generalist"
import { Tool, Toolkit } from "effect/unstable/ai"
import { TestModel } from "generalist/testing"

const dropTableTool = Tool.make("drop_table", {
  description: "Drop a database table",
  parameters: Schema.Struct({ table: Schema.String }),
  success: Schema.String,
})

const toolkit = Toolkit.make(dropTableTool)
const agent = Agent.make({ name: "db-assistant", toolkit })

const permissionsLayer = Permissions.layerRuleset({
  rules: [{ pattern: "drop_*", level: "deny", reason: "Schema changes require a migration" }],
  fallback: "allow",
})

const modelLayer = TestModel.layer([TestModel.toolCall("drop_table", { table: "users" }, { id: "drop-1" })])

const program = Effect.gen(function* () {
  const result = yield* Agent.run(agent, "Drop the users table.")
  yield* Console.log(result)
}).pipe(
  Effect.catchTag("generalist/core/PermissionDenied", (failure) =>
    Console.log(`drop_table authorization: ${failure.message}`),
  ),
)

const runtimeLayer = Layer.mergeAll(
  modelLayer,
  toolkit.toLayer({ drop_table: () => Effect.die("denied calls never reach the handler") }),
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
  permissionsLayer,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
```

**Output**

```text
drop_table authorization: Schema changes require a migration
```

## 3. Resolve asks interactively

For an in-process host, such as a CLI or a test harness, `Approvals.resolve` receives every ask-level decision and answers `Approved`, `Denied`, or `Pending`. An `Approved` resolution can carry an explicit `remember` rule. The authorizer writes that rule through `RuleStore` before executing the call:

**interactive-asks.ts**

```typescript
import { Console, Effect, Layer } from "effect"
import { Approvals, Permissions } from "generalist"

const _policyLayer = Layer.mergeAll(
  Permissions.layerRuleset({
    rules: [
      { pattern: "read_*", level: "allow" },
      { pattern: "deploy_*", level: "ask" },
    ],
    fallback: "ask",
  }),
  Approvals.layerTest({
    resolve: (pending) =>
      Console.log(`Allow ${pending.call.name} with ${JSON.stringify(pending.call.params)}? [y/N/always]`).pipe(
        Effect.as<Approvals.Resolution>({
          _tag: "Approved",
          remember: { pattern: pending.call.name, level: "allow" },
        }),
      ),
  }),
  Permissions.layerRuleStoreMemory([{ pattern: "read_*", level: "allow" }]),
)
```

`Permissions.layerRuleStoreMemory` keeps remembered rules for the process lifetime; durable hosts implement `RuleStore.remember` over their own storage.

## 4. Let asks suspend for out-of-process hosts

If `Approvals.resolve` returns `Pending`, an ask-level call suspends the run with `AgentSuspended` and a `permission:`-prefixed token. Handle it exactly like an approval suspension: store the token, decide out-of-band, re-enter with `RunOptions.resume`. [Suspension as a typed error](/learn/suspension) covers the re-entry contract.

## Next steps

- Add the human approval gate behind allow-level calls: [How to require human approval for a tool](/guides/approvals).
- See every policy service on the run: [Seams as services](/learn/seams-as-services).
