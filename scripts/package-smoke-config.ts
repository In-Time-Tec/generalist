export const packages = ["tenetkit", "pg", "mysql", "cloudflare", "rivet"] as const
export const packageNames = {
  tenetkit: "tenetkit",
  pg: "@tenetkit/pg",
  mysql: "@tenetkit/mysql",
  cloudflare: "@tenetkit/cloudflare",
  rivet: "@tenetkit/rivet",
} satisfies Record<(typeof packages)[number], string>
export const compressedSizeLimits = {
  tenetkit: 700_000,
  pg: 180_000,
  mysql: 120_000,
  cloudflare: 120_000,
  rivet: 80_000,
} satisfies Record<(typeof packages)[number], number>
export const packedEffectDependencies = {
  tenetkit: [
    "@effect/ai-anthropic",
    "@effect/ai-openai",
    "@effect/ai-openai-compat",
    "@effect/ai-openrouter",
    "@effect/sql-sqlite-bun",
  ],
  pg: ["@effect/sql-pg"],
  mysql: ["@effect/sql-mysql2"],
  cloudflare: ["@effect/sql-sqlite-do"],
  rivet: [],
} satisfies Record<(typeof packages)[number], ReadonlyArray<string>>
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
  readonly packages: ReadonlyArray<(typeof packages)[number]>
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
    packages: ["tenetkit"],
    peers: [],
    imports: [
      { specifier: "tenetkit", runtimes: nodeAndBun, exports: ["Agent", "Session"] },
      { specifier: "tenetkit/agent-guidance", runtimes: nodeAndBun },
      { specifier: "tenetkit/ai/deterministic", runtimes: nodeAndBun, exports: ["layer"] },
      { specifier: "tenetkit/ai/model-catalog", runtimes: nodeAndBun, exports: ["layer"] },
      { specifier: "tenetkit/ai/model-route", runtimes: nodeAndBun, exports: ["make"] },
      { specifier: "tenetkit/ai/openai-account-auth", runtimes: nodeAndBun },
      { specifier: "tenetkit/ai/openai-account-auth-http", runtimes: nodeAndBun },
      { specifier: "tenetkit/memory", runtimes: nodeAndBun },
      { specifier: "tenetkit/repl", runtimes: nodeAndBun },
      { specifier: "tenetkit/repl/bun", runtimes: bunOnly },
      { specifier: "tenetkit/runtime", runtimes: nodeAndBun, exports: ["Runtime"] },
      { specifier: "tenetkit/runtime/external-child-placement", runtimes: nodeAndBun },
      { specifier: "tenetkit/runtime/external-child-store", runtimes: nodeAndBun },
      { specifier: "tenetkit/runtime/sql-driver", runtimes: nodeAndBun },
      { specifier: "tenetkit/skills", runtimes: nodeAndBun },
      { specifier: "tenetkit/transport", runtimes: nodeAndBun },
      { specifier: "tenetkit/transport/errors", runtimes: nodeAndBun },
      { specifier: "tenetkit/transport/replay", runtimes: nodeAndBun },
      { specifier: "tenetkit/transport/run-client", runtimes: nodeAndBun },
      { specifier: "tenetkit/transport/snapshot", runtimes: nodeAndBun },
      { specifier: "tenetkit/transport/sse", runtimes: nodeAndBun },
      { specifier: "tenetkit/transport/websocket", runtimes: nodeAndBun },
      { specifier: "tenetkit/transport/wire", runtimes: nodeAndBun },
    ],
  },
  {
    name: "sqlite-bun",
    packages: ["tenetkit"],
    peers: ["@effect/sql-sqlite-bun"],
    imports: [{ specifier: "tenetkit/runtime/sqlite-bun", runtimes: bunOnly, exports: ["Runtime", "RunStore"] }],
  },
  {
    name: "mcp",
    packages: ["tenetkit"],
    peers: ["@modelcontextprotocol/sdk"],
    imports: [
      { specifier: "tenetkit/mcp", runtimes: nodeAndBun },
      { specifier: "tenetkit/mcp/client", runtimes: nodeAndBun },
      { specifier: "tenetkit/mcp/client/http", runtimes: nodeAndBun },
      { specifier: "tenetkit/mcp/client/stdio", runtimes: nodeAndBun },
      { specifier: "tenetkit/mcp/oauth", runtimes: nodeAndBun },
      { specifier: "tenetkit/mcp/tools", runtimes: nodeAndBun },
    ],
  },
  {
    name: "foldkit",
    packages: ["tenetkit"],
    peers: ["foldkit"],
    imports: [{ specifier: "tenetkit/foldkit", runtimes: nodeAndBun }],
  },
  {
    name: "a2a",
    packages: ["tenetkit"],
    peers: ["@a2a-js/sdk"],
    imports: [{ specifier: "tenetkit/a2a", runtimes: nodeAndBun }],
  },
  {
    name: "ag-ui",
    packages: ["tenetkit"],
    peers: ["@ag-ui/core"],
    imports: [{ specifier: "tenetkit/ag-ui", runtimes: nodeAndBun }],
  },
  {
    name: "test-host",
    packages: ["tenetkit"],
    peers: ["@effect/vitest", "vitest"],
    imports: [
      { specifier: "tenetkit/test", runtimes: nodeAndBun, exports: ["TestModel"] },
      { specifier: "tenetkit/test/runtime-driver", runtimes: nodeAndBun },
    ],
  },
  {
    name: "anthropic",
    packages: ["tenetkit"],
    peers: ["@effect/ai-anthropic"],
    imports: [{ specifier: "tenetkit/ai/anthropic", runtimes: nodeAndBun, exports: ["layer"] }],
  },
  {
    name: "openai",
    packages: ["tenetkit"],
    peers: ["@effect/ai-openai"],
    imports: [
      { specifier: "tenetkit/ai/openai", runtimes: nodeAndBun, exports: ["layer"] },
      { specifier: "tenetkit/ai/openai-embedding", runtimes: nodeAndBun },
      { specifier: "tenetkit/ai/openai-responses", runtimes: nodeAndBun },
    ],
  },
  {
    name: "openai-compatible",
    packages: ["tenetkit"],
    peers: ["@effect/ai-openai-compat"],
    imports: [
      { specifier: "tenetkit/ai/openai-chat-completions", runtimes: nodeAndBun },
      { specifier: "tenetkit/ai/openai-compatible", runtimes: nodeAndBun },
      { specifier: "tenetkit/ai/openai-compatible-embedding", runtimes: nodeAndBun },
    ],
  },
  {
    name: "openrouter",
    packages: ["tenetkit"],
    peers: ["@effect/ai-openrouter"],
    imports: [{ specifier: "tenetkit/ai/openrouter", runtimes: nodeAndBun, exports: ["layer"] }],
  },
  {
    name: "amazon-bedrock",
    packages: ["tenetkit"],
    peers: ["@aws-sdk/client-bedrock-runtime", "@aws-sdk/credential-provider-node", "@smithy/types"],
    imports: [{ specifier: "tenetkit/ai/amazon-bedrock", runtimes: nodeOnly, exports: ["layer"] }],
  },
  {
    name: "sql-adapters",
    packages: ["tenetkit", "pg", "mysql"],
    peers: [],
    imports: [
      { specifier: "@tenetkit/pg", runtimes: nodeAndBun, exports: ["layer", "RunSchema"] },
      { specifier: "@tenetkit/mysql", runtimes: nodeAndBun, exports: ["layer", "RunSchema"] },
    ],
  },
  {
    name: "cloudflare",
    packages: ["tenetkit", "cloudflare"],
    peers: [],
    imports: [
      { specifier: "@tenetkit/cloudflare/durable-objects", runtimes: workerOnly, exports: ["layerRunStore"] },
      { specifier: "@tenetkit/cloudflare/dynamic-workers", runtimes: workerOnly, exports: ["layer", "make"] },
      { specifier: "@tenetkit/cloudflare/workers", runtimes: workerOnly, exports: ["make"] },
    ],
  },
  {
    name: "rivet",
    packages: ["tenetkit", "rivet"],
    peers: [],
    imports: [{ specifier: "@tenetkit/rivet/actors", runtimes: nodeAndBun, exports: ["makeRuntimeActor"] }],
  },
] as const satisfies ReadonlyArray<MinimumConsumerProfile>

export const workerSafePackageExports = [
  "tenetkit",
  "tenetkit/mcp",
  "tenetkit/mcp/client",
  "tenetkit/mcp/client/http",
  "tenetkit/mcp/oauth",
  "tenetkit/mcp/tools",
  "tenetkit/ai/openrouter",
  "tenetkit/runtime",
  "tenetkit/runtime/sql-driver",
] as const

export const wildcardExportExamples = [] as const
export const forbiddenPackageExports = [
  "@tenetkit/cloudflare",
  "tenetkit/ai",
  "tenetkit/core",
  "tenetkit/ai/index",
  "tenetkit/ai/provider/openrouter",
  "tenetkit/core/agent/service",
  "tenetkit/runtime/service",
  "tenetkit/runtime/execution/run-executor-internal",
] as const

export const exactPackageExports = {
  tenetkit: [
    ".",
    "./a2a",
    "./ag-ui",
    "./agent-guidance",
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
    "./foldkit",
    "./mcp",
    "./mcp/client",
    "./mcp/client/http",
    "./mcp/client/stdio",
    "./mcp/oauth",
    "./mcp/tools",
    "./memory",
    "./repl",
    "./repl/bun",
    "./runtime",
    "./runtime/external-child-placement",
    "./runtime/external-child-store",
    "./runtime/sql-driver",
    "./runtime/sqlite-bun",
    "./skills",
    "./test",
    "./test/runtime-driver",
    "./transport",
    "./transport/errors",
    "./transport/replay",
    "./transport/run-client",
    "./transport/snapshot",
    "./transport/sse",
    "./transport/websocket",
    "./transport/wire",
  ],
  pg: ["."],
  mysql: ["."],
  cloudflare: ["./durable-objects", "./dynamic-workers", "./workers"],
  rivet: ["./actors"],
} as const satisfies Record<(typeof packages)[number], ReadonlyArray<string>>
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

export const tarballName = (input: { readonly packageName: string; readonly version: string }): string =>
  input.packageName === "tenetkit"
    ? `tenetkit-${input.version}.tgz`
    : `tenetkit-${input.packageName}-${input.version}.tgz`
