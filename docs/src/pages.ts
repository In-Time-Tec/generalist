import { sections, type Block, type Section } from "./content"

export const groups = ["Start", "Build", "Control", "Coordinate", "Keep work", "Connect"] as const
export const pathFor = (page: Pick<Section, "id">): string => {
  if (page.id === "home") return "/"
  if (page.id === "why") return "/why"
  return `/docs/${page.id}`
}

export const pageForPath = (pathname: string): Section | undefined =>
  sections.find((section) => pathFor(section) === (pathname.replace(/\/$/, "") || "/"))

export const headingId = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

export const outline = (section: Section): ReadonlyArray<{ id: string; title: string }> =>
  section.blocks.flatMap((block) =>
    block.kind === "heading" ? [{ id: headingId(block.text), title: block.text }] : [],
  )

export type SearchResult = Readonly<{
  id: string
  title: string
  description: string
  category: string
  href: string
}>

const blockText = (block: Block): string => {
  switch (block.kind) {
    case "paragraph":
    case "heading":
      return block.text
    case "code":
      return block.example.source
    case "note":
      return `${block.title} ${block.text}`
    case "list":
      return block.items.join(" ")
    case "table":
      return block.rows.flat().join(" ")
    case "links":
      return block.items.map((item) => `${item.title} ${item.description}`).join(" ")
    case "diagram":
      return ""
  }
}

const searchEntries = sections.flatMap((section) => {
  const entries: Array<SearchResult & { text: string }> = [
    {
      id: section.id,
      title: section.label,
      description: section.description,
      category: section.group,
      href: pathFor(section),
      text: `${section.title} ${section.description} ${section.blocks.map(blockText).join(" ")}`.toLowerCase(),
    },
  ]
  for (const [index, block] of section.blocks.entries()) {
    if (block.kind !== "heading") continue
    const nextHeading = section.blocks.findIndex((next, nextIndex) => nextIndex > index && next.kind === "heading")
    const content = section.blocks.slice(index + 1, nextHeading === -1 ? undefined : nextHeading)
    const paragraph = content.find((next) => next.kind === "paragraph")
    entries.push({
      id: `${section.id}-${headingId(block.text)}`,
      title: block.text,
      description: paragraph?.text ?? section.description,
      category: `${section.group} / ${section.label}`,
      href: `${pathFor(section)}#${headingId(block.text)}`,
      text: `${block.text} ${content.map(blockText).join(" ")}`.toLowerCase(),
    })
  }
  return entries
})

export const searchPages = (query: string): ReadonlyArray<SearchResult> => {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return searchEntries.filter((entry) => !entry.href.includes("#")).slice(0, 7)
  return searchEntries
    .filter((entry) => words.every((word) => entry.text.includes(word) || entry.title.toLowerCase().includes(word)))
    .map((entry) => ({
      entry,
      score:
        words.reduce((score, word) => score + (entry.title.toLowerCase().includes(word) ? 10 : 1), 0) +
        (entry.title.toLowerCase() === query.toLowerCase().trim() ? 20 : 0),
    }))
    .toSorted((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ entry }) => entry)
}
