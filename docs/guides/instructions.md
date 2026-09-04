---
title: "How to compose instructions and instruction providers"
description: "Register ordered instruction providers with Instructions.layer and load AGENTS.md files as providers."
---

The `Instructions` service replaces a single instruction string with an ordered registry of `Provider` values. At run start the loop renders instruction providers once into the system message. Persona, house style, and repository files compose as providers instead of string concatenation.

## 1. Register ordered providers

Build baselines with `Instructions.fromText(id, text)`. Provide them in order with `Instructions.layer`. When the registry produces a non-empty baseline, it replaces `agent.instructions`, and rendered fragments join with one blank line:

**instruction-providers.ts**

```typescript
import { Console, Effect, Layer, ManagedRuntime, Option, Schema, Stream } from "effect"
import { Agent, Approvals, Instructions, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { LanguageModel, Response } from "effect/unstable/ai"

const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})

const persona = Instructions.fromText("persona", "You are the release-notes assistant.")

const houseStyle = Instructions.fromText("house-style", "Write one sentence per change. Never use exclamation marks.")

const instructionsLayer = Instructions.layer([persona, houseStyle])

const agent = Agent.make({ name: "release-notes", instructions: "This fallback is replaced by the registry." })

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: (options) => {
      const system = options.prompt.content.find((message) => message.role === "system")
      const text =
        system === undefined
          ? "no system message"
          : Option.getOrElse(Schema.decodeOption(Schema.String)(system.content), () => "no system message")
      return Stream.make(
        Response.makePart("text-delta", { id: "assistant", delta: text }),
        Response.makePart("finish", { reason: "stop", usage, response: undefined }),
      )
    },
  }),
)

const program = Effect.gen(function* () {
  const result = yield* Agent.run(agent, "What are your instructions?")
  yield* Console.log(result)
})

const runtimeLayer = Layer.mergeAll(
  modelLayer,
  ToolExecutor.layerTest({ execute: () => Effect.die("unexpected tool call") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
  instructionsLayer,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
```

**Output**

```text
You are the release-notes assistant.

Write one sentence per change. Never use exclamation marks.
```

<Note title="Precedence">
An explicit `RunOptions.system` wins over the registry, and a `RunOptions.history` transcript is used verbatim. Both skip provider rendering entirely.
</Note>

## 2. Keep Agent instructions in the baseline

Every provider renders once at run start into the stable system-message baseline. This makes model-provider prompt caching effective. A provider returning `Option.none()` contributes nothing. Use `fromText`, provide it through `Instructions.layer`, and let Agent render the providers. Policy instruction overrides are independent: they prepend a system message once to the selected follow-up prompt, and that message remains in chat history.

## 3. Load AGENTS.md files as providers

`load` from `generalist/instructions` walks ancestor directories for `AGENTS.md` or `CLAUDE.md` (root first, nearest last), plus any `globalFiles` you list. Map the results into text providers:

**instruction-files.ts**

```typescript
import { Effect, FileSystem, Path, PlatformError } from "effect"
import { Instructions } from "generalist"
import { load } from "generalist/instructions"

export const repoProviders: Effect.Effect<
  ReadonlyArray<Instructions.Provider>,
  PlatformError.PlatformError,
  FileSystem.FileSystem | Path.Path
> = load({ cwd: "." }).pipe(Effect.map((files) => files.map((file) => Instructions.fromText(file.path, file.content))))
```

The effect requires `FileSystem` and `Path`; provide them from your platform runtime. Core never reads the filesystem itself.

## Next steps

- Add lazily-loaded skills next to the baseline listing: [How to add skills](/guides/skills).
- See how epochs interact with summarized history: [How to stay inside the context window](/guides/compaction).
