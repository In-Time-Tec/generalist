import { describe, expect, it } from "@effect/vitest"
import { Prompt } from "effect/unstable/ai"
import { Compaction, Media } from "../../src/index.js"
import { compactPrompt, type Strategy } from "../../src/media/compaction.js"

const ref: Media.RefValue = {
  sha256: "0".repeat(64),
  mediaType: "image/png",
  bytes: 3,
  filename: "image.png",
}

const prompt = Prompt.fromMessages([Prompt.makeMessage("user", { content: [Media.part(ref)] })])

const parts = (value: Prompt.Prompt): ReadonlyArray<Prompt.Part> => {
  const message = value.content[0]
  return message === undefined || (message.role !== "user" && message.role !== "assistant") ? [] : message.content
}

describe("media compaction", () => {
  it("defaults Compaction.Strategy media to elide", () => {
    expect(Compaction.defaultStrategy().media).toBe("elide")
  })

  for (const policy of ["elide", "keep", "describe"] as const satisfies ReadonlyArray<Strategy>) {
    it(`${policy}s a durable media reference`, () => {
      const [compacted, changed] = compactPrompt(prompt, policy)
      const output = parts(compacted)

      expect(changed).toBe(policy !== "keep")
      expect(output.some((part) => part.type === "file")).toBe(policy !== "elide")
      expect(output.some((part) => part.type === "text" && part.text.includes(ref.sha256))).toBe(policy !== "keep")
    })
  }

  it("does not add a duplicate describe request across compaction passes", () => {
    const [first] = compactPrompt(prompt, "describe")
    const [second, changed] = compactPrompt(first, "describe")
    expect(changed).toBe(false)
    expect(parts(second)).toEqual(parts(first))
  })
})
