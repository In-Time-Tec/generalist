export const packages = ["core", "test", "skills", "memory", "providers", "mcp", "transport", "foldkit"] as const
export const compressedSizeLimits: Record<(typeof packages)[number], number> = {
  core: 110_000,
  test: 8_000,
  skills: 13_000,
  memory: 10_000,
  providers: 35_000,
  mcp: 12_000,
  transport: 30_000,
  foldkit: 16_000,
}

export const packedEffectDependencies: Record<(typeof packages)[number], ReadonlyArray<string>> = {
  core: [],
  test: [],
  skills: [],
  memory: [],
  providers: ["@effect/ai-anthropic", "@effect/ai-openai", "@effect/ai-openai-compat", "@effect/ai-openrouter"],
  mcp: [],
  transport: [],
  foldkit: [],
}
export const packedProviderDependencies = {
  "@aws-sdk/client-bedrock-runtime": "3.859.0",
  "@aws-sdk/credential-provider-node": "3.859.0",
  "@smithy/types": "4.3.1",
} as const

export const sortRecord = (value: Record<string, string> | undefined): Record<string, string> =>
  Object.fromEntries(Object.entries(value ?? {}).toSorted(([left], [right]) => left.localeCompare(right)))

export const catalogVersion = (
  rootManifest: {
    readonly workspaces: {
      readonly catalog: Readonly<Record<string, string>>
      readonly catalogs?: Readonly<Record<string, Readonly<Record<string, string>>>>
    }
  },
  dependency: string,
  reference: string,
): string | undefined => {
  const catalogName = reference.slice("catalog:".length)
  const catalog =
    catalogName.length === 0 ? rootManifest.workspaces.catalog : rootManifest.workspaces.catalogs?.[catalogName]
  return catalog?.[dependency]
}
