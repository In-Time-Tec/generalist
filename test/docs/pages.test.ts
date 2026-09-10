import { describe, expect, it } from "@effect/vitest"
import { codeExamples, sections } from "../../docs/src/content.js"
import { groups, outline, pageForPath, pathFor, searchPages } from "../../docs/src/pages.js"

describe("documentation pages", () => {
  it("routes every page and rejects unknown paths", () => {
    expect(pageForPath("/")?.id).toBe("home")
    expect(pageForPath("/why")?.id).toBe("why")
    expect(pageForPath("/missing")).toBeUndefined()
    expect(new Set(sections.map(pathFor)).size).toBe(sections.length)
    for (const section of sections) {
      expect(pageForPath(pathFor(section))).toBe(section)
      expect(pageForPath(`${pathFor(section)}/`)).toBe(section)
      expect(groups).toContain(section.group)
      const headings = outline(section)
      expect(new Set(headings.map((heading) => heading.id)).size).toBe(headings.length)
    }
  })

  it("keeps example identities unique and documentation links on site", () => {
    expect(new Set(codeExamples.map((example) => example.id)).size).toBe(codeExamples.length)
    for (const section of sections) {
      for (const block of section.blocks) {
        if (block.kind !== "links") continue
        for (const link of block.items) {
          expect(link.href.startsWith("/")).toBe(true)
          const [path = ""] = link.href.split("#")
          expect(pageForPath(path)).toBeDefined()
        }
      }
    }
  })

  it("ranks exact topics and searches code symbols as well as prose", () => {
    expect(searchPages("approvals")[0]?.href).toBe("/docs/approvals")
    expect(searchPages("Agent.run").length).toBeGreaterThan(0)
    expect(searchPages("MCPClient").some((result) => result.href.startsWith("/docs/mcp"))).toBe(true)
    expect(searchPages("not-a-real-docs-query-93821")).toEqual([])
    expect(searchPages("  ").length).toBeGreaterThan(0)
  })

  it("search results lead to real pages and headings", () => {
    for (const query of ["", "agent", "memory", "approval", "runtime", "compaction", "tool"]) {
      for (const result of searchPages(query)) {
        const [path = "", hash] = result.href.split("#")
        const section = pageForPath(path)
        expect(section).toBeDefined()
        if (hash !== undefined) expect(outline(section!).map((heading) => heading.id)).toContain(hash)
      }
    }
  })
})
