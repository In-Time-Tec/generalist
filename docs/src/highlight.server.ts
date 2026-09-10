import { FileRenderer, type FileRenderResult } from "@pierre/diffs"
import { Effect, Schema } from "effect"
import { codeExamples } from "./content"
import type { CodeHighlights, CodeToken } from "./code"

class HighlightFailed extends Schema.TaggedError<HighlightFailed>()("HighlightFailed", {
  example: Schema.String,
}) {}

type TokenNode = FileRenderResult["contentAST"][number]

const tokens = (node: TokenNode, light = "", dark = ""): ReadonlyArray<CodeToken> => {
  if (node.type === "text") return [{ text: node.value, light, dark }]
  if (node.type !== "element") return []
  const style = Schema.is(Schema.String)(node.properties.style) ? node.properties.style : ""
  const lightColor = /--diffs-token-light:(#[\da-fA-F]+)/.exec(style)?.[1] ?? light
  const darkColor = /--diffs-token-dark:(#[\da-fA-F]+)/.exec(style)?.[1] ?? dark
  return node.children.flatMap((child) => tokens(child, lightColor, darkColor))
}

export const highlightCode: Effect.Effect<CodeHighlights, HighlightFailed> = Effect.acquireUseRelease(
  Effect.sync(
    () =>
      new FileRenderer({
        theme: { light: "github-light-high-contrast", dark: "pierre-dark" },
        disableFileHeader: true,
      }),
  ),
  (renderer) =>
    Effect.forEach(
      codeExamples,
      (example) => {
        const source = example.source.trim()
        if (example.language === "text") {
          return Effect.succeed([
            example.id,
            source.split("\n").map((text) => [{ text, light: "", dark: "" }]),
          ] as const)
        }
        return Effect.tryPromise({
          try: () =>
            renderer.asyncRender({
              name: example.title,
              contents: source,
              lang: example.language,
            }),
          catch: () => HighlightFailed.make({ example: example.id }),
        }).pipe(Effect.map((result) => [example.id, result.contentAST.map((line) => tokens(line))] as const))
      },
      { concurrency: 1 },
    ).pipe(Effect.map((entries) => Object.fromEntries(entries))),
  (renderer) => Effect.sync(() => renderer.cleanUp()),
)
