import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const pins = new Set([
  "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
  "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6",
  "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
  "actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830",
  "actions/attest-build-provenance@96278af6caaf10aea03fd8d33a09a777ca52d62f",
  "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
  "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
])

describe("release workflows", () => {
  it("keeps release recovery immutable, authenticated, and least-privileged", () => {
    const source = readFileSync(".github/workflows/publish.yml", "utf8")
    const workflow = JSON.parse(
      execFileSync("bun", ["-e", "console.log(JSON.stringify(Bun.YAML.parse(await Bun.stdin.text())))"], {
        input: source,
        encoding: "utf8",
      }),
    ) as any
    expect(workflow.on.workflow_dispatch.inputs).toEqual({
      tag: expect.objectContaining({ required: true, type: "string" }),
      expected_commit: expect.objectContaining({ required: true, type: "string" }),
    })
    expect(workflow.on.push.tags).toEqual(["v*"])
    expect(workflow.permissions).toEqual({})
    expect(workflow.concurrency).toEqual({
      group: "release-${{ github.event_name == 'workflow_dispatch' && inputs.tag || github.ref_name }}",
      "cancel-in-progress": false,
    })
    expect(workflow.jobs.produce.permissions).toEqual({ contents: "read", "id-token": "write", attestations: "write" })
    expect(workflow.jobs.release.permissions).toEqual({ contents: "write" })
    expect(workflow.jobs.publish.permissions).toEqual({ contents: "read", "id-token": "write" })
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
    expect(source.match(/\(\.packages \| length\) == 11/g)).toHaveLength(2)
    for (const packageName of [
      "a2a",
      "ag-ui",
      "core",
      "foldkit",
      "mcp",
      "memory",
      "providers",
      "runtime",
      "skills",
      "test",
      "transport",
    ]) {
      expect(source).toContain(`batonfx-${packageName}-\${VERSION}.tgz`)
    }
    expect(source).not.toMatch(/bun publish|Rewrite package manifests/)
    for (const workflowFile of [".github/workflows/ci.yml", ".github/workflows/publish.yml"]) {
      const uses = [...readFileSync(workflowFile, "utf8").matchAll(/uses:\s*(\S+)/g)].map((match) => match[1])
      expect(uses.every((use) => pins.has(use!))).toBe(true)
    }
    const release = source.split("  release:")[1]!.split("  publish:")[0]!
    expect(release).not.toMatch(/checkout|bun install|npm install|bun run (?:build|package)|pm pack/)
  })
})
