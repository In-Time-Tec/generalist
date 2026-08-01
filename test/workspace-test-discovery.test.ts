import { existsSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

const root = new URL("..", import.meta.url).pathname
const ignored = /(?:^|\/)(?:repos|dist|coverage|node_modules|\.turbo|generated)(?:\/|$)/
const expectedRoots = ["packages", "apps", "examples", "test", "tooling"]

const filesUnder = (directory: string): Array<string> => {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (ignored.test(relative(root, path))) return []
    if (entry.isDirectory()) return filesUnder(path)
    return entry.isFile() && entry.name.endsWith(".test.ts") ? [relative(root, path)] : []
  })
}

describe("workspace test discovery", () => {
  it("keeps every behavioral test under the canonical Vitest roots", () => {
    const discovered = expectedRoots.flatMap((directory) => filesUnder(join(root, directory))).toSorted()
    expect(discovered.length).toBeGreaterThan(0)
    expect(discovered).not.toContain(expect.stringContaining("repos/effect"))
    for (const file of discovered) expect(statSync(join(root, file)).isFile()).toBe(true)
  })
})
