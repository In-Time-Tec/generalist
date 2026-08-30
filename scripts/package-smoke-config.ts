export const packages = ["tenetkit", "pg", "mysql", "cloudflare"] as const
export const packageNames = {
  tenetkit: "tenetkit",
  pg: "@tenetkit/pg",
  mysql: "@tenetkit/mysql",
  cloudflare: "@tenetkit/cloudflare",
} satisfies Record<(typeof packages)[number], string>
export const compressedSizeLimits = {
  tenetkit: 700_000,
  pg: 180_000,
  mysql: 120_000,
  cloudflare: 120_000,
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
} satisfies Record<(typeof packages)[number], ReadonlyArray<string>>
export const packedProviderDependencies = {
  "@aws-sdk/client-bedrock-runtime": "3.859.0",
  "@aws-sdk/credential-provider-node": "3.859.0",
  "@smithy/types": "4.3.1",
} as const

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
