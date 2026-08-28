import { fileURLToPath } from "node:url"
import type { Plugin } from "vite"

const prefix = "virtual:source/"

export const sourceTextPlugin = {
  name: "source-text",
  enforce: "pre",
  resolveId(id) {
    return id.startsWith(prefix)
      ? `${fileURLToPath(new URL(`../${id.slice(prefix.length)}`, import.meta.url))}?raw`
      : null
  },
} satisfies Plugin
