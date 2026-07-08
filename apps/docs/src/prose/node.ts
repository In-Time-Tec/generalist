import type { Html } from "foldkit/html"

export type Inline =
  | Readonly<{ kind: "text"; text: string }>
  | Readonly<{ kind: "inlineCode"; text: string }>
  | Readonly<{ kind: "link"; href: string; text: string }>
  | Readonly<{ kind: "strong"; text: string }>

export type CalloutTone = "info" | "warning" | "inRepo"

export type Node =
  | Readonly<{ kind: "heading"; level: 2 | 3; id: string; text: string }>
  | Readonly<{ kind: "lead"; text: string }>
  | Readonly<{ kind: "para"; content: ReadonlyArray<Inline> }>
  | Readonly<{ kind: "bullets"; items: ReadonlyArray<ReadonlyArray<Inline>> }>
  | Readonly<{ kind: "code"; label: string; language: string; source: string; expectedOutput?: string }>
  | Readonly<{ kind: "callout"; tone: CalloutTone; label: string; content: ReadonlyArray<Inline> }>
  | Readonly<{ kind: "table"; head: ReadonlyArray<string>; rows: ReadonlyArray<ReadonlyArray<ReadonlyArray<Inline>>> }>
  | Readonly<{ kind: "pills"; items: ReadonlyArray<string> }>
  | Readonly<{ kind: "custom"; html: Html; text: string }>

export type TocEntry = Readonly<{ id: string; label: string; level: 2 | 3 }>
