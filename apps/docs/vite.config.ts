import { fileURLToPath } from "node:url"
import { foldkit } from "@foldkit/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

export default defineConfig(({ mode }) => ({
  plugins: [
    {
      name: "source-text",
      enforce: "pre",
      resolveId(id, importer) {
        return id.startsWith("virtual:source/") && importer !== undefined
          ? `${new URL(id.slice("virtual:source/".length), import.meta.url).pathname}?raw`
          : null
      },
    },
    tailwindcss(),
    foldkit(mode === "test" ? {} : { devToolsMcpPort: 9989 }),
  ],
  resolve: {
    alias: [
      { find: "@/components/ui", replacement: fileURLToPath(new URL("./src/components/ui", import.meta.url)) },
      { find: "@/lib", replacement: fileURLToPath(new URL("./src/lib", import.meta.url)) },
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
    ],
  },
  test: {
    environment: "happy-dom",
  },
}))
