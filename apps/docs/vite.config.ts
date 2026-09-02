import { fileURLToPath } from "node:url"
import { foldkit } from "@foldkit/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import { Config, Effect } from "effect"
import { defineConfig } from "vite"
import { sourceTextPlugin } from "./scripts/source-text-plugin"

export default defineConfig(({ mode }) => ({
  plugins: [sourceTextPlugin, tailwindcss(), foldkit(mode === "test" ? {} : { devToolsMcpPort: 9989 })],
  server: {
    port: Effect.runSync(Config.port("PORT").pipe(Config.withDefault(5173))),
  },
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
