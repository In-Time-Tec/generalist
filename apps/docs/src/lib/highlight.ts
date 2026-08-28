// Synchronous, dependency-free TypeScript/JavaScript token highlighter for
// FoldKit code blocks. Returns lines of { text, cls } tokens; `cls` maps to the
// .hl-* classes shipped in the theme (styles.css), whose colors are driven by
// the --code-* variables. FoldKit renders synchronously, so a Shiki-style async
// highlighter is a poor fit — a small hand-tokenizer gives legible, themeable
// highlighting inline with the view.

import { dual } from "effect/Function"

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
const isLineComment = (code: string, index: number) => code[index] === "/" && code[index + 1] === "/"
const isBlockComment = (code: string, index: number) => code[index] === "/" && code[index + 1] === "*"
const isNumberStart = (code: string, index: number) =>
  isDigit(code[index] ?? "") || (code[index] === "." && isDigit(code[index + 1] ?? ""))
const isWhitespace = (character: string) => isInlineSpace(character) || character === "\n"

const scanWhile = (code: string, start: number, accepts: (character: string, index: number) => boolean): number => {
  let end = start
  while (end < code.length && accepts(code[end] ?? "", end)) end += 1
  return end
}

const scanQuoted = (code: string, start: number, quote: string, stopAtNewline: boolean): number => {
  let end = start + 1
  while (end < code.length) {
    if (code[end] === quote || (stopAtNewline && code[end] === "\n")) break
    if (code[end] === "\\") end += 1
    end += 1
  }
  return Math.min(code.length, end + 1)
}

const scanBlockComment = (code: string, start: number): number => {
  let end = start + 2
  while (end < code.length && !(code[end] === "*" && code[end + 1] === "/")) end += 1
  return Math.min(code.length, end + 2)
}

const identifierClass = (word: string, previous: string, next: string): string => {
  if (KEYWORDS.has(word)) return "hl-keyword"
  if (CONSTANTS.has(word)) return "hl-constant"
  if (previous === ".") return next === "(" ? "hl-func" : "hl-property"
  if (/^[A-Z]/.test(word)) return "hl-type"
  if (next === "(") return "hl-func"
  return "hl-plain"
}

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

    if (isLineComment(code, i)) {
      const j = scanWhile(code, i + 2, (character) => character !== "\n")
      emit(code.slice(i, j), "hl-comment")
      i = j
      continue
    }

    if (isBlockComment(code, i)) {
      const j = scanBlockComment(code, i)
      emit(code.slice(i, j), "hl-comment")
      i = j
      continue
    }

    if (c === "`") {
      const j = scanQuoted(code, i, "`", false)
      emit(code.slice(i, j), "hl-string")
      i = j
      continue
    }

    if (c === '"' || c === "'") {
      const j = scanQuoted(code, i, c, true)
      emit(code.slice(i, j), "hl-string")
      i = j
      continue
    }

    if (isNumberStart(code, i)) {
      const j = scanWhile(code, i + 1, (character) => /[0-9a-fA-F_.xXoObB]/.test(character))
      emit(code.slice(i, j), "hl-number")
      i = j
      continue
    }

    if (isIdentStart(c)) {
      const j = scanWhile(code, i + 1, isIdent)
      const word = code.slice(i, j)
      const k = scanWhile(code, j, isInlineSpace)
      const next = code[k] ?? ""
      emit(word, identifierClass(word, previous, next))
      i = j
      continue
    }

    if (isWhitespace(c)) {
      const j = scanWhile(code, i + 1, isWhitespace)
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
export const highlight: {
  (code: string, language: string): ReadonlyArray<ReadonlyArray<Token>>
  (language: string): (code: string) => ReadonlyArray<ReadonlyArray<Token>>
} = dual(2, (code: string, language: string): ReadonlyArray<ReadonlyArray<Token>> => {
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
})
