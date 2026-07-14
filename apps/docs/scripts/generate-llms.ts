import { createServer } from "vite"

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" })
const { llmsFull, llmsIndex } = await server.ssrLoadModule("/src/content/registry.ts")

await Bun.write(new URL("../public/llms.txt", import.meta.url), `${llmsIndex()}\n`)
await Bun.write(new URL("../public/llms-full.txt", import.meta.url), `${llmsFull()}\n`)
await server.close()
