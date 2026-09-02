export const packageName = "generalist"
export const packageDirectory = "packages/generalist"
export const compressedSizeLimit = 1_200_000
export const packedEffectDependencies = [
  "@effect/ai-anthropic",
  "@effect/ai-openai",
  "@effect/ai-openai-compat",
  "@effect/ai-openrouter",
  "@effect/sql-mysql2",
  "@effect/sql-pg",
  "@effect/sql-sqlite-bun",
  "@effect/sql-sqlite-do",
] as const
export const packedProviderDependencies = {
  "@aws-sdk/client-bedrock-runtime": "3.859.0",
  "@aws-sdk/credential-provider-node": "3.859.0",
  "@smithy/types": "4.3.1",
} as const

export type ConsumerRuntime = "bun" | "node" | "worker"
export interface ConsumerImport {
  readonly specifier: string
  readonly runtimes: ReadonlyArray<ConsumerRuntime>
  readonly exports?: ReadonlyArray<string>
}
export interface MinimumConsumerProfile {
  readonly name: string
  readonly peers: ReadonlyArray<string>
  readonly imports: ReadonlyArray<ConsumerImport>
}

const nodeAndBun = ["bun", "node"] as const
const bunOnly = ["bun"] as const
const nodeOnly = ["node"] as const
const workerOnly = ["worker"] as const

export const minimumConsumerProfiles = [
  {
    name: "core-runtime",
    peers: [],
    imports: [
      { specifier: "generalist", runtimes: nodeAndBun, exports: ["Agent", "Session"] },
      { specifier: "generalist/ai/deterministic", runtimes: nodeAndBun, exports: ["layer"] },
      { specifier: "generalist/ai/model-catalog", runtimes: nodeAndBun, exports: ["layer"] },
      { specifier: "generalist/ai/model-route", runtimes: nodeAndBun, exports: ["make"] },
      { specifier: "generalist/ai/openai-account-auth", runtimes: nodeAndBun },
      { specifier: "generalist/ai/openai-account-auth-http", runtimes: nodeAndBun },
      { specifier: "generalist/memory", runtimes: nodeAndBun },
      { specifier: "generalist/repl", runtimes: nodeAndBun },
      { specifier: "generalist/repl/bun", runtimes: bunOnly },
      { specifier: "generalist/runtime", runtimes: nodeAndBun, exports: ["Runtime"] },
      { specifier: "generalist/runtime/external-child-placement", runtimes: nodeAndBun },
      { specifier: "generalist/runtime/external-child-store", runtimes: nodeAndBun },
      { specifier: "generalist/runtime/sql-driver", runtimes: nodeAndBun },
      { specifier: "generalist/instructions", runtimes: nodeAndBun, exports: ["load"] },
      { specifier: "generalist/instructions/skills", runtimes: nodeAndBun },
      { specifier: "generalist/transport", runtimes: nodeAndBun },
      { specifier: "generalist/transport/errors", runtimes: nodeAndBun },
      { specifier: "generalist/transport/replay", runtimes: nodeAndBun },
      { specifier: "generalist/transport/run-client", runtimes: nodeAndBun },
      { specifier: "generalist/transport/snapshot", runtimes: nodeAndBun },
      { specifier: "generalist/transport/sse", runtimes: nodeAndBun },
      { specifier: "generalist/transport/websocket", runtimes: nodeAndBun },
      { specifier: "generalist/transport/wire", runtimes: nodeAndBun },
    ],
  },
  {
    name: "sqlite-bun",
    peers: ["@effect/sql-sqlite-bun"],
    imports: [{ specifier: "generalist/runtime/sqlite-bun", runtimes: bunOnly, exports: ["Runtime", "RunStore"] }],
  },
  {
    name: "mcp",
    peers: ["@modelcontextprotocol/sdk"],
    imports: [
      { specifier: "generalist/mcp", runtimes: nodeAndBun },
      { specifier: "generalist/mcp/client", runtimes: nodeAndBun },
      { specifier: "generalist/mcp/client/http", runtimes: nodeAndBun },
      { specifier: "generalist/mcp/client/stdio", runtimes: nodeAndBun },
      { specifier: "generalist/mcp/oauth", runtimes: nodeAndBun },
      { specifier: "generalist/mcp/tools", runtimes: nodeAndBun },
    ],
  },
  {
    name: "foldkit",
    peers: ["foldkit"],
    imports: [{ specifier: "generalist/foldkit", runtimes: nodeAndBun }],
  },
  {
    name: "a2a",
    peers: ["@a2a-js/sdk"],
    imports: [{ specifier: "generalist/a2a", runtimes: nodeAndBun }],
  },
  {
    name: "ag-ui",
    peers: ["@ag-ui/core"],
    imports: [{ specifier: "generalist/ag-ui", runtimes: nodeAndBun }],
  },
  {
    name: "test-host",
    peers: ["@effect/vitest", "vitest"],
    imports: [
      { specifier: "generalist/testing", runtimes: nodeAndBun, exports: ["TestModel", "Testing"] },
      { specifier: "generalist/testing/runtime-driver", runtimes: nodeAndBun, exports: ["runtimeDriver"] },
    ],
  },
  {
    name: "anthropic",
    peers: ["@effect/ai-anthropic"],
    imports: [{ specifier: "generalist/ai/anthropic", runtimes: nodeAndBun, exports: ["layer"] }],
  },
  {
    name: "openai",
    peers: ["@effect/ai-openai"],
    imports: [
      { specifier: "generalist/ai/openai", runtimes: nodeAndBun, exports: ["layer"] },
      { specifier: "generalist/ai/openai-embedding", runtimes: nodeAndBun },
      { specifier: "generalist/ai/openai-responses", runtimes: nodeAndBun },
    ],
  },
  {
    name: "openai-compatible",
    peers: ["@effect/ai-openai-compat"],
    imports: [
      { specifier: "generalist/ai/openai-chat-completions", runtimes: nodeAndBun },
      { specifier: "generalist/ai/openai-compatible", runtimes: nodeAndBun },
      { specifier: "generalist/ai/openai-compatible-embedding", runtimes: nodeAndBun },
    ],
  },
  {
    name: "openrouter",
    peers: ["@effect/ai-openrouter"],
    imports: [{ specifier: "generalist/ai/openrouter", runtimes: nodeAndBun, exports: ["layer"] }],
  },
  {
    name: "amazon-bedrock",
    peers: ["@aws-sdk/client-bedrock-runtime", "@aws-sdk/credential-provider-node", "@smithy/types"],
    imports: [{ specifier: "generalist/ai/amazon-bedrock", runtimes: nodeOnly, exports: ["layer"] }],
  },
  {
    name: "sql-adapters",
    peers: ["@effect/sql-pg", "@effect/sql-mysql2"],
    imports: [
      { specifier: "generalist/pg", runtimes: nodeAndBun, exports: ["layer", "RuntimeSchema"] },
      { specifier: "generalist/mysql", runtimes: nodeAndBun, exports: ["layer", "RuntimeSchema"] },
    ],
  },
  {
    name: "cloudflare",
    peers: ["@effect/sql-sqlite-do", "es-module-lexer"],
    imports: [
      {
        specifier: "generalist/cloudflare/durable-objects",
        runtimes: workerOnly,
        exports: ["HibernatingWebSocket", "layerRunStore"],
      },
      { specifier: "generalist/cloudflare/dynamic-workers", runtimes: workerOnly, exports: ["layer", "make"] },
      { specifier: "generalist/cloudflare/workers", runtimes: workerOnly, exports: ["make"] },
    ],
  },
  {
    name: "rivet",
    peers: ["@standard-schema/spec", "rivetkit"],
    imports: [{ specifier: "generalist/rivet/actors", runtimes: nodeAndBun, exports: ["makeRuntimeActor"] }],
  },
] as const satisfies ReadonlyArray<MinimumConsumerProfile>

export const workerSafePackageExports = [
  "generalist",
  "generalist/mcp",
  "generalist/mcp/client",
  "generalist/mcp/client/http",
  "generalist/mcp/oauth",
  "generalist/mcp/tools",
  "generalist/ai/openrouter",
  "generalist/runtime",
  "generalist/runtime/sql-driver",
] as const

export const wildcardExportExamples = [] as const
export const forbiddenPackageExports = [
  "generalist/cloudflare",
  "generalist/rivet",
  "generalist/ai",
  "generalist/core",
  "generalist/ai/index",
  "generalist/ai/provider/openrouter",
  "generalist/core/agent/service",
  "generalist/runtime/service",
  "generalist/runtime/execution/run-executor-internal",
] as const

export const exactPackageExports = [
  ".",
  "./a2a",
  "./ag-ui",
  "./ai/amazon-bedrock",
  "./ai/anthropic",
  "./ai/deterministic",
  "./ai/model-catalog",
  "./ai/model-route",
  "./ai/openai",
  "./ai/openai-account-auth",
  "./ai/openai-account-auth-http",
  "./ai/openai-chat-completions",
  "./ai/openai-compatible",
  "./ai/openai-compatible-embedding",
  "./ai/openai-embedding",
  "./ai/openai-responses",
  "./ai/openrouter",
  "./cloudflare/durable-objects",
  "./cloudflare/dynamic-workers",
  "./cloudflare/workers",
  "./foldkit",
  "./instructions",
  "./instructions/skills",
  "./mcp",
  "./mcp/client",
  "./mcp/client/http",
  "./mcp/client/stdio",
  "./mcp/oauth",
  "./mcp/tools",
  "./memory",
  "./mysql",
  "./pg",
  "./repl",
  "./repl/bun",
  "./rivet/actors",
  "./runtime",
  "./runtime/external-child-placement",
  "./runtime/external-child-store",
  "./runtime/sql-driver",
  "./runtime/sqlite-bun",
  "./testing",
  "./testing/runtime-driver",
  "./transport",
  "./transport/errors",
  "./transport/replay",
  "./transport/run-client",
  "./transport/snapshot",
  "./transport/sse",
  "./transport/websocket",
  "./transport/wire",
] as const

const sorted = <A>(values: Iterable<A>, compare: (left: A, right: A) => number): Array<A> =>
  Array.from(values).reduce<Array<A>>((result, value) => {
    const index = result.findIndex((item) => compare(value, item) < 0)
    result.splice(index < 0 ? result.length : index, 0, value)
    return result
  }, [])
export const sortRecord = (value: Readonly<Record<string, string>> | undefined): Record<string, string> => {
  const entries = sorted(Object.entries(value ?? {}), ([left], [right]) => left.localeCompare(right))
  return Object.fromEntries(entries)
}
export const catalogVersion = (input: {
  readonly rootManifest: {
    readonly workspaces: {
      readonly catalog: Readonly<Record<string, string>>
      readonly catalogs?: Readonly<Record<string, Readonly<Record<string, string>>>>
    }
  }
  readonly dependency: string
  readonly reference: string
}): string | undefined => {
  const catalogName = input.reference.slice("catalog:".length)
  const catalog =
    catalogName.length === 0
      ? input.rootManifest.workspaces.catalog
      : input.rootManifest.workspaces.catalogs?.[catalogName]
  return catalog?.[input.dependency]
}

export const tarballName = (version: string): string => `generalist-${version}.tgz`
