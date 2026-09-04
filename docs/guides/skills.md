---
title: "How to add skills"
description: "Provide a SkillCatalog, let the loop advertise skills and the activate_skill tool, and load SKILL.md directories from the filesystem."
---

A skill is reusable instruction material the agent loads on demand: startup context carries only its name and description, and the model calls the built-in `activate_skill` tool to pull in a skill's full body when the task matches. Provide a `SkillCatalog` layer and the loop handles the rest: startup advertisement, the activation tool, and lazy instruction loading.

## 1. Write a SKILL.md

Skills follow the agentskills `SKILL.md` format: a directory holding a `SKILL.md` with YAML-style frontmatter and a Markdown body. `name` and `description` are required, and the name must match the directory:

**release-notes/SKILL.md**

```markdown
---
name: release-notes
description: Draft release notes from merged changes before announcing a version.
whenToUse: The user asks for release notes or a changelog entry.
allowed-tools: read_file search_docs
---

Collect the merged changes since the last tag, group them by package, and
write one sentence per change. Order sections by user impact. End with an
upgrade note when any change is breaking.
```

## 2. Provide a catalog and watch activation

For skills defined in code, build `SkillCatalog.Skill` values and provide `SkillCatalog.layerSkills`. Each value directly carries its flattened name, description, flags, instructions, tools, and optional location. The loop appends the advertised skills to the system message, advertises `activate_skill`, handles the activation call itself (it never reaches your executor), and returns `{ name, instructions, allowedTools }` to the model as an ordinary tool result:

**activate-skill.ts**

```typescript
import { Console, Effect, Layer, ManagedRuntime, Stream } from "effect"
import { Agent, Approvals, ModelMiddleware, Permissions, SkillCatalog, ToolExecutor } from "generalist"
import { LanguageModel, Response } from "effect/unstable/ai"

const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})

const releaseNotesSkill: SkillCatalog.Skill = {
  name: "release-notes",
  description: "Draft release notes from merged changes before announcing a version.",
  allowedTools: ["read_file", "search_docs"],
  instructions: Effect.succeed("Group changes by package and write one sentence per change."),
  tools: [],
}

const agent = Agent.make({ name: "release-assistant", instructions: "Use skills when they match the task." })

let calls = 0

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: (options) => {
      calls += 1
      if (calls === 1) {
        return Stream.make(
          Response.makePart("tool-call", {
            id: "skill-1",
            name: "activate_skill",
            params: { name: "release-notes" },
            providerExecuted: false,
          }),
          Response.makePart("finish", { reason: "tool-calls", usage, response: undefined }),
        )
      }
      const bodyLoaded = JSON.stringify(options.prompt.content).includes("one sentence per change")
      return Stream.make(
        Response.makePart("text-delta", {
          id: "assistant",
          delta: bodyLoaded ? "Skill body loaded; drafting the release notes." : "Skill body missing.",
        }),
        Response.makePart("finish", { reason: "stop", usage, response: undefined }),
      )
    },
  }),
)

const program = Effect.gen(function* () {
  const result = yield* Agent.run(agent, "Draft release notes for 0.2.0.")
  yield* Console.log(result)
})

const runtimeLayer = Layer.mergeAll(
  modelLayer,
  ToolExecutor.layerTest({ execute: () => Effect.die("activate_skill is handled by the loop, not the executor") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
  SkillCatalog.layerSkills([releaseNotesSkill]),
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
```

**Output**

```text
Skill body loaded; drafting the release notes.
```

<Note title="Instructions are lazy">
`Skill.instructions` is an Effect evaluated only on activation, and each instruction body loads once per run. Non-activated skills cost one advertised line each.
</Note>

## 3. Load skill directories from the filesystem

`FileSystemCatalog.layer` from `generalist/instructions/skills` discovers `SKILL.md` files under your roots (defaults: `.agents/skills`, `.claude/skills`, `.pi/skills`), validates each standard name against its immediate directory, and reads only frontmatter up front:

**file-system-catalog.ts**

```typescript
import { FileSystem, Layer, Path } from "effect"
import { SkillCatalog } from "generalist"
import { FileSystemCatalog } from "generalist/instructions/skills"

export const fileSystemSkills: Layer.Layer<
  SkillCatalog.SkillCatalog,
  SkillCatalog.SkillCatalogError,
  FileSystem.FileSystem | Path.Path
> = FileSystemCatalog.layer({
  cwd: ".",
  roots: [".agents/skills", ".claude/skills"],
})
```

Provide `FileSystem` and `Path` from your platform runtime. Later roots win on name collisions.

## 4. Compose hosted catalogs

`SkillCatalog.layer` composes catalogs with later catalogs winning duplicate names. Hosted adapters load one bounded manifest snapshot through Effect HTTP and fetch SHA-256-verified bodies only on activation:

**hosted-skills.ts**

```typescript
import { Crypto, FileSystem, Layer, Path } from "effect"
import { HttpClient } from "effect/unstable/http"
import { SkillCatalog } from "generalist"
import { GitHubCatalog, HttpCatalog, S3Catalog, FileSystemCatalog } from "generalist/instructions/skills"

export const skills: Layer.Layer<
  SkillCatalog.SkillCatalog,
  SkillCatalog.SkillCatalogError,
  Crypto.Crypto | FileSystem.FileSystem | HttpClient.HttpClient | Path.Path
> = SkillCatalog.layer<Crypto.Crypto | FileSystem.FileSystem | HttpClient.HttpClient | Path.Path>([
  FileSystemCatalog.make({ cwd: ".", roots: [".agents/skills"] }),
  HttpCatalog.make({ manifestUrl: "https://skills.example.com/skills.json" }),
  S3Catalog.make({ bucket: "company-skills", region: "us-west-2", prefix: "support" }),
  GitHubCatalog.make({
    owner: "company",
    repo: "agent-skills",
    ref: "0123456789abcdef0123456789abcdef01234567",
    root: "skills",
  }),
])
```

<Warning title="Hosted distribution is adapter-owned">
The Agent Skills standard defines directory contents, not catalogs. Generalist uses its own versioned manifest; authenticate or sign requests by decorating the provided HttpClient. S3 does not list buckets, and GitHub requires an immutable commit ref.
</Warning>

## 5. Mind the listing budget

The loop selects listings under a fixed 2,048-token budget with `SkillCatalog.selectListings`: skills marked `disableModelInvocation` are excluded, and least-recently-used listings drop first when over budget. Descriptions are capped at `descriptionLimit` (1,024 characters), matching the Agent Skills description limit, so front-load the sentence that tells the model when to activate.

## Next steps

- Compose skills with the rest of the system message: [How to compose instructions and instruction providers](/guides/instructions).
- Remember facts across runs instead of re-teaching them: [How to add memory](/guides/memory).
