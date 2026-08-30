import { expect, layer } from "@effect/vitest"
import { Effect, FileSystem, Path } from "effect"
import { layer as bunLayer } from "@effect/platform-bun/BunServices"

const pins = new Set([
  "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
  "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6",
  "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
  "actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830",
  "actions/attest-build-provenance@96278af6caaf10aea03fd8d33a09a777ca52d62f",
  "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
  "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
])

const sorted = (values: ReadonlyArray<string>): Array<string> =>
  values.reduce<Array<string>>((result, value) => {
    const index = result.findIndex((item) => value.localeCompare(item) < 0)
    result.splice(index < 0 ? result.length : index, 0, value)
    return result
  }, [])

const readWorkflow = (name: string) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    return yield* fileSystem.readFileString(path.resolve(".", `.github/workflows/${name}`))
  })

const workspacePackages = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const packageNames: Array<string> = yield* fileSystem.readDirectory(path.resolve(".", "packages"))
  packageNames.sort()
  return packageNames
})

layer(bunLayer)("release workflows", (it) => {
  it.effect("requires the behavioral test suite in continuous integration", () =>
    Effect.gen(function* () {
      const source = yield* readWorkflow("ci.yml")
      expect(source).toContain("run: bun run check")
      expect(source).toContain("run: bun run test")
    }),
  )

  it.effect("keeps release recovery immutable, authenticated, and least-privileged", () =>
    Effect.gen(function* () {
      const source = yield* readWorkflow("publish.yml")
      const packageNames = yield* workspacePackages
      expect(source).toMatch(/tag:\n(?: {8}.+\n)* {8}required: true\n {8}type: string/)
      expect(source).toMatch(/expected_commit:\n(?: {8}.+\n)* {8}required: true\n {8}type: string/)
      expect(source).toContain('tags: ["v*"]')
      expect(source).toContain("permissions: {}")
      expect(source).toContain(
        "group: release-${{ github.event_name == 'workflow_dispatch' && inputs.tag || github.ref_name }}",
      )
      expect(source).toContain("cancel-in-progress: false")
      expect(source).toMatch(
        /produce:[\s\S]*?permissions:\n {6}contents: read\n {6}id-token: write\n {6}attestations: write/,
      )
      expect(source).toMatch(/release:[\s\S]*?permissions:\n {6}contents: write/)
      expect(source).toMatch(/publish:[\s\S]*?permissions:\n {6}contents: read\n {6}id-token: write/)
      expect(source.match(/bun run package/g)).toHaveLength(1)
      expect(source).toContain("subject-path: release/*")
      expect(source).toContain("github.event.repository.private == false || github.event.enterprise != null")
      expect(source).toContain("sha256sum --check SHA256SUMS")
      expect(source).toContain("--draft --verify-tag")
      expect(source).toContain("persist-credentials: false")
      expect(source).toContain('"$(git rev-list -n1 "refs/tags/$tag^{commit}")" == "$source_commit"')
      expect(source).toContain('git merge-base --is-ancestor "$source_commit" origin/main')
      expect(source).toContain('git merge-base --is-ancestor "$source_commit" origin/release')
      expect(source).toContain("gh auth setup-git")
      expect(source.indexOf("Validate immutable release identity")).toBeLessThan(
        source.indexOf("bun install --frozen-lockfile"),
      )
      expect(source.match(/repos\/\$GH_REPO\/commits\/\$TAG/g)).toHaveLength(2)
      expect(source).toContain("NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}")
      expect(source).toContain('npm publish "$filename" "${publish_args[@]}"')
      expect(source).toContain('[[ "$registry_integrity" == "$local_integrity" ]]')
      expect(source).toContain('curl --fail --silent --show-error "https://registry.npmjs.org/${1/\\//%2f}/$2"')
      expect(source).not.toContain('npm view "$package@$VERSION"')
      expect(source.match(/'\.packages\[\] \| \.name'/g)).toHaveLength(2)
      expect(source.match(new RegExp(`\\(\\.packages \\| length\\) == ${packageNames.length}`, "g"))).toHaveLength(2)
      expect(source.match(/\(\.packages \| length\) == \d+/g)).toHaveLength(2)
      expect(
        source.match(/printf '%s\\n' tenetkit @tenetkit\/pg @tenetkit\/mysql @tenetkit\/cloudflare @tenetkit\/rivet/g),
      ).toHaveLength(2)
      for (const manifests of source.matchAll(/for manifest in package\.json packages\/\{(.+?)\}/g)) {
        expect(sorted(manifests[1].split(","))).toEqual(packageNames)
      }
      expect(source.match(/for manifest in package\.json packages\/\{/g)).toHaveLength(1)
      for (const packageName of packageNames) {
        expect(source).toContain(
          packageName === "tenetkit" ? `tenetkit-\${VERSION}.tgz` : `tenetkit-${packageName}-\${VERSION}.tgz`,
        )
      }
      expect(source).not.toMatch(/bun publish|Rewrite package manifests/)
      for (const workflowFile of [".github/workflows/ci.yml", ".github/workflows/publish.yml"]) {
        const uses = [
          ...(yield* readWorkflow(workflowFile.replace(".github/workflows/", ""))).matchAll(/uses:\s*(\S+)/g),
        ].map((match) => match[1])
        expect(uses.every((use) => pins.has(use))).toBe(true)
      }
      const release = source.split("  release:")[1].split("  publish:")[0]
      expect(release).not.toMatch(/checkout|bun install|npm install|bun run (?:build|package)|pm pack/)
    }),
  )
})
