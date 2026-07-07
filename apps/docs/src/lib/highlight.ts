// Synchronous, dependency-free TypeScript/JavaScript token highlighter for
// FoldKit code blocks. Returns lines of { text, cls } tokens; `cls` maps to the
// .hl-* classes shipped in the theme (styles.css), whose colors are driven by
// the --code-* variables. FoldKit renders synchronously, so a Shiki-style async
// highlighter is a poor fit — a small hand-tokenizer gives legible, themeable
// highlighting inline with the view.

export type Token = Readonly<{ text: string; cls: string }>

const KEYWORDS = new Set([
  "abstract",
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "declare",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "finally",
  "for",
  "from",
  "function",
  "get",
  "if",
  "implements",
  "import",
  "in",
  "infer",
  "instanceof",
  "interface",
  "is",
  "keyof",
  "let",
  "namespace",
  "new",
  "of",
  "private",
  "protected",
  "public",
  "readonly",
  "return",
  "satisfies",
  "set",
  "static",
  "super",
  "switch",
  "throw",
  "try",
  "type",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
])

const CONSTANTS = new Set(["true", "false", "null", "undefined", "this", "NaN", "Infinity"])

const isIdentStart = (c: string) => /[A-Za-z_$]/.test(c)
const isIdent = (c: string) => /[\w$]/.test(c)
const isDigit = (c: string) => c >= "0" && c <= "9"
const isInlineSpace = (c: string) => c === " " || c === "\t"

const tokenize = (code: string): ReadonlyArray<Token> => {
  const out: Array<Token> = []
  const length = code.length
  let i = 0
  let previous = ""

  const emit = (text: string, cls: string) => {
    out.push({ text, cls })
    if (text.trim() !== "") previous = text
  }

  while (i < length) {
    const c = code[i] ?? ""

    if (c === "/" && code[i + 1] === "/") {
      let j = i + 2
      while (j < length && code[j] !== "\n") j += 1
      emit(code.slice(i, j), "hl-comment")
      i = j
      continue
    }

    if (c === "/" && code[i + 1] === "*") {
      let j = i + 2
      while (j < length && !(code[j] === "*" && code[j + 1] === "/")) j += 1
      j = Math.min(length, j + 2)
      emit(code.slice(i, j), "hl-comment")
      i = j
      continue
    }

    if (c === "`") {
      let j = i + 1
      while (j < length && code[j] !== "`") {
        if (code[j] === "\\") j += 1
        j += 1
      }
      emit(code.slice(i, Math.min(length, j + 1)), "hl-string")
      i = Math.min(length, j + 1)
      continue
    }

    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < length && code[j] !== c && code[j] !== "\n") {
        if (code[j] === "\\") j += 1
        j += 1
      }
      emit(code.slice(i, Math.min(length, j + 1)), "hl-string")
      i = Math.min(length, j + 1)
      continue
    }

    if (isDigit(c) || (c === "." && isDigit(code[i + 1] ?? ""))) {
      let j = i + 1
      while (j < length && /[0-9a-fA-F_.xXoObB]/.test(code[j] ?? "")) j += 1
      emit(code.slice(i, j), "hl-number")
      i = j
      continue
    }

    if (isIdentStart(c)) {
      let j = i + 1
      while (j < length && isIdent(code[j] ?? "")) j += 1
      const word = code.slice(i, j)
      let k = j
      while (k < length && isInlineSpace(code[k] ?? "")) k += 1
      const next = code[k] ?? ""
      let cls: string
      if (KEYWORDS.has(word)) cls = "hl-keyword"
      else if (CONSTANTS.has(word)) cls = "hl-constant"
      else if (previous === ".") cls = next === "(" ? "hl-func" : "hl-property"
      else if (/^[A-Z]/.test(word)) cls = "hl-type"
      else if (next === "(") cls = "hl-func"
      else cls = "hl-plain"
      emit(word, cls)
      i = j
      continue
    }

    if (isInlineSpace(c) || c === "\n") {
      let j = i + 1
      while (j < length && (isInlineSpace(code[j] ?? "") || code[j] === "\n")) j += 1
      out.push({ text: code.slice(i, j), cls: "hl-plain" })
      i = j
      continue
    }

    emit(c, "hl-punct")
    i += 1
  }

  return out
}

const isHighlightable = (language: string): boolean =>
  ["ts", "typescript", "tsx", "js", "javascript", "jsx", ""].includes(language.toLowerCase())

/** Tokenize `code` into lines of tokens. Unsupported languages render as one plain token per line. */
export const highlight = (code: string, language: string): ReadonlyArray<ReadonlyArray<Token>> => {
  const tokens: ReadonlyArray<Token> = isHighlightable(language)
    ? tokenize(code)
    : code
        .split("\n")
        .flatMap((line, index) =>
          (index === 0 ? [] : [{ text: "\n", cls: "hl-plain" }]).concat([{ text: line, cls: "hl-plain" }]),
        )

  const lines: Array<Array<Token>> = [[]]
  for (const token of tokens) {
    const parts = token.text.split("\n")
    parts.forEach((part, index) => {
      if (index > 0) lines.push([])
      if (part.length > 0) lines[lines.length - 1]?.push({ text: part, cls: token.cls })
    })
  }
  return lines
}
