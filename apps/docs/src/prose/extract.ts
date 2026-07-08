import type { Inline, Node, TocEntry } from "./node"

const inlineText = (content: ReadonlyArray<Inline>): string => content.map((inline) => inline.text).join("")

export const collectToc = (nodes: ReadonlyArray<Node>): ReadonlyArray<TocEntry> =>
  nodes.flatMap((node) => (node.kind === "heading" ? [{ id: node.id, label: node.text, level: node.level }] : []))

export const collectHeadings = (nodes: ReadonlyArray<Node>): string =>
  nodes.flatMap((node) => (node.kind === "heading" ? [node.text] : [])).join("\n")

export const collectText = (nodes: ReadonlyArray<Node>): string =>
  nodes
    .flatMap((node) => {
      switch (node.kind) {
        case "heading":
          return [node.text]
        case "lead":
          return [node.text]
        case "para":
          return [inlineText(node.content)]
        case "bullets":
          return node.items.map(inlineText)
        case "code":
          return [node.label]
        case "callout":
          return [node.label, inlineText(node.content)]
        case "table":
          return [node.head.join(" "), ...node.rows.map((row) => row.map(inlineText).join(" "))]
        case "pills":
          return [node.items.join(" ")]
        case "custom":
          return [node.text]
      }
    })
    .join("\n")

export const collectMarkdown = (nodes: ReadonlyArray<Node>): string =>
  nodes
    .map((node) => {
      switch (node.kind) {
        case "heading":
          return `${node.level === 2 ? "##" : "###"} ${node.text}`
        case "lead":
          return node.text
        case "para":
          return inlineText(node.content)
        case "bullets":
          return node.items.map((item) => `- ${inlineText(item)}`).join("\n")
        case "code":
          return `\`\`\`${node.language}\n${node.source}\n\`\`\`${node.expectedOutput === undefined ? "" : `\n\nOutput:\n\`\`\`\n${node.expectedOutput}\n\`\`\``}`
        case "callout":
          return `> ${node.label}: ${inlineText(node.content)}`
        case "table":
          return [
            `| ${node.head.join(" | ")} |`,
            `| ${node.head.map(() => "---").join(" | ")} |`,
            ...node.rows.map((row) => `| ${row.map(inlineText).join(" | ")} |`),
          ].join("\n")
        case "pills":
          return node.items.map((item) => `\`${item}\``).join(", ")
        case "custom":
          return node.text
      }
    })
    .join("\n\n")
